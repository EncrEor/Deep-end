const ClientsService = require('./ClientsService');
const ProductsService = require('./ProductsService');
const AbbreviationsService = require('./AbbreviationsService');
const JuiceFamilies = require('./JuiceFamilies');

class MessageParser {
  constructor() {
    // Pas forcément besoin de stocker, 
    // vous pouvez importer directly.
  }

  /**
   * parseMessage(message)
   * ---------------------
   * 1) On détecte le client sur la 1ʳᵉ ligne.
   * 2) Les lignes suivantes contiennent:
   *    - soit un bloc "3 4 5" => [C, M, F, R],
   *    - soit un bloc "7 0 10 5 5mg" => le 5ᵉ nombre + abréviation = ex: "Mangue",
   *    - etc.
   * 3) Si la ligne "4 2 5" correspond à un changement de format (ex: la 3ᵉ ligne => 25CL),
   *    on met contextFormat = "25CL". 
   * 4) Si on rencontre "surgelé" => contextIsFrozen = true (jusqu'au prochain mot-clé).
   */
  async parseMessage(message) {
    const lines = message
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);  // enlever lignes vides

    const orders = [];
    let currentClient = null;

    // Contexte de parse
    let currentFormat = "1L";   // ou "25CL", "5L"
    let isFrozen = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1) Tenter d'identifier un client
      const maybeClient = this.resolveClient(line);
      if (maybeClient) {
        // On a un client => on reset le contexte
        currentClient = maybeClient;
        currentFormat = this.formatFromDefault(currentClient.defaultFormat); // ex: "1" -> "1L"
        isFrozen = false;
        continue;
      }

      // 2) Vérifier si la ligne contient "surgelé" => tout ce qui suit est surgelé
      if (this.isSurgeléKeyword(line)) {
        isFrozen = true;
        continue;
      }

      // 3) Vérifier si la ligne est un "retour" => ... (optionnel)
      // 4) Vérifier si la ligne force un changement de format (ex: 3ᵉ ligne => 25CL)
      //    => "la 3eme ligne par défaut c’est 25CL"? ou vous vous basez sur la regle:
      //       "Si la 2eme ligne c’est 1L, la 3eme c’est 25CL" etc.
      //    => Pour démo, on va dire : "Une ligne '4 2 5' => c’est un bloc 25CL"
      //    => ou la remarque "si y a pas de format, on reste sur le default"
      //    => On gère plutôt la logique "3ᵉ ligne => 25CL" dans le code si besoin
      //    => Par simplification, on skip, 
      //       mais vous pouvez coder: if (i===2) currentFormat="25CL";

      // 5) Sinon, c’est un bloc de quantités
      if (currentClient) {
        const productItems = this.parseLineQuantities(line, currentFormat, isFrozen);
        if (productItems && productItems.length > 0) {
          orders.push({
            client: currentClient,
            products: productItems
          });
        }
      }
    }

    return orders;
  }

  /**
   * resolveClient(line)
   * - Détecte si "line" correspond à un client (via AbbreviationsService.resolveFullClientData)
   */
  resolveClient(line) {
    const AbbreviationsService = require('./AbbreviationsService');
    const fullClient = AbbreviationsService.resolveFullClientData(line);
    return fullClient; // null/undefined si pas client, sinon {id, name, zone, defaultFormat,...}
  }

  /**
   * isSurgeléKeyword(line): détecte si la ligne indique "surgelé"
   */
  isSurgeléKeyword(line) {
    // On peut chercher "surgele", "surgelees", "surgeler"... 
    // On normalise
    const lower = line.toLowerCase();
    return lower.includes("surgelé") || lower.includes("surgele") || lower.includes("surgelee");
  }

  /**
   * formatFromDefault(defVal)
   *  - '1' => '1L'
   *  - '25' => '25CL'
   *  - '5' => '5L'
   */
  formatFromDefault(defVal) {
    if (defVal==="25") return "25CL";
    if (defVal==="5")  return "5L";
    return "1L";
  }

  /**
   * parseLineQuantities(line, currentFormat, isFrozen)
   * -------------------------------------------------
   * Gère le cas:
   *  - ex: "3 4 5" => [Citron, Mojito, Fraise, Red=0]
   *  - ex: "7 0 10 5 5mg" => => 7 Citron, 0 Mojito, 10 Fraise, 5 Red, + 5 mg (Mangue)
   *  - ex: "2 f" => => 2 Fraise (format & isFrozen)
   *  - etc.
   */
  parseLineQuantities(line, currentFormat, isFrozen) {
    const tokens = line.split(/\s+/);

    // On extrait les nombres initiaux
    // ex: "7 0 10 5 5mg" => on va itérer sur tokens, 
    //    tant qu'on a un parseInt OK, on accumule
    //    puis si on tombe sur "5mg", c'est un "nombre + abréviation"
    //    => ex: 5 mg => 5 Mangue

    let idx = 0;
    const numericValues = [];

    // Collecter les quantités "pures"
    while (idx < tokens.length) {
      const t = tokens[idx];
      const quantity = parseInt(t, 10);
      // Vérif si c'est un "nombre" exact
      if (!isNaN(quantity) && t.replace(/\D+/g,'')===`${quantity}`) {
        // c'est un nombre pur => ex: "3", "4", "5"
        numericValues.push(quantity);
        idx++;
      } else {
        // pas un nombre "pur"
        break;
      }
    }

    // On a ex: numericValues= [7,0,10,5], 
    // il reste tokens[idx] => "5mg", etc. jusqu'à la fin
    const restTokens = tokens.slice(idx); // ex: ["5mg", "m1ls", ...]

    // 1) Interpréter numericValues selon la regle default=1 => [C, M, F, R]
    const baseProducts = this.parseDefaultBlock(numericValues, currentFormat, isFrozen);

    // 2) Puis interpréter chaque restToken si format "[5][abr]"
    const extraProducts = [];
    restTokens.forEach(rt => {
      // ex: "5mg" => on détecte la partie "5" + "mg"
      const match = rt.match(/^(\d+)([a-zA-Z]+)/);
      if (match) {
        const qty = parseInt(match[1], 10); // 5
        const abrev = match[2];            // mg
        // On map "mg" => "MG" (famille Mangue)
        const family = this.getJuiceFamily(abrev);
        if (family) {
          const pid = this.buildProductId(family, currentFormat, isFrozen);
          extraProducts.push({ productId: pid, quantity: qty });
        }
      } else {
        //  ex: "cool" => quantity??? 
        //  ou "m1ls" => c'est un format explicite?? 
        //  Ici c'est plus avancé, on skip la démo
      }
    });

    return [...baseProducts, ...extraProducts];
  }

  /**
   * parseDefaultBlock(nums, currentFormat, isFrozen)
   * ex: [7,0,10,5] => [ {productId:"C1L",quantity:7}, {productId:"M1L",quantity:0}, ... ]
   * S'il y a 4 nums => [C, M, F, R]
   * s'il y a 3 => [C, M, F, R=0]
   * s'il y a 2 => si default=5 => [F, C], sinon on le code autrement
   */
  parseDefaultBlock(nums, currentFormat, isFrozen) {
    const out = [];
    if (!nums.length) return out;

    // Convert "1" -> "1L", "25"->"25CL", "5"->"5L" => on suppose c'est fait par "currentFormat"
    // Règle #1 : si default=1 => 3-4 quantités => [Citron, Mojito, Fraise, Red].
    // Règle #2 : si default=5 => 2 chiffres => [Fraise, Citron].
    // Règle #3 : si default=25 => 3-4 => [Citron25CL, Mojito25CL, Fraise25CL, Red25CL].
    
    // On détecte le "type" via currentFormat
    if (currentFormat==="1L") {
      // On a [C, M, F, R]
      // ex: nums=[3,4,5] => [C=3, M=4, F=5, R=0]
      const families = ["C","M","F","R"];
      for (let i = 0; i < families.length; i++) {
        const q = nums[i] || 0;
        if (q>0) {
          const pid = this.buildProductId(families[i], "1L", isFrozen);
          out.push({productId: pid, quantity: q});
        }
      }
    } else if (currentFormat==="25CL") {
      // families = [C, M, F, R]
      const families = ["C","M","F","R"];
      for (let i = 0; i < families.length; i++) {
        const q = nums[i] || 0;
        if (q>0) {
          const pid = this.buildProductId(families[i], "25CL", isFrozen);
          out.push({productId: pid, quantity: q});
        }
      }
    } else if (currentFormat==="5L") {
      // Règle #2 : 2 chiffres => [F, C]
      // ex: [3,4] => 3 Fraise 5L, 4 Citron 5L
      const families = ["F","C"]; 
      for (let i = 0; i < families.length; i++) {
        const q = nums[i] || 0;
        if (q>0) {
          const pid = this.buildProductId(families[i], "5L", isFrozen);
          out.push({productId: pid, quantity: q});
        }
      }
    }
    return out;
  }

  /**
   * getJuiceFamily(abrev)
   * ex: "mg" -> "MG"
   */
  getJuiceFamily(abrev) {
    const a = abrev.toLowerCase();
    const entry = JuiceFamilies[a];
    return entry ? entry.familyCode : undefined;
  }

  /**
   * buildProductId("M", "1L", true) => "M1LS"
   */
  buildProductId(familyCode, format, isFrozen) {
    let id = familyCode + format;
    if (isFrozen) id += "S";
    return id;
  }
}

module.exports = new MessageParser();