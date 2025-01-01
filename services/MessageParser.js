const ClientsService = require('./ClientsService');
const ProductsService = require('./ProductsService');
const AbbreviationsService = require('./AbbreviationsService');
const JuiceFamilies = require('./JuiceFamilies');

class MessageParser {
  constructor() {
    // On conserve ces services si vous en avez toujours besoin
    //this.clientsService = ClientsService;
    //this.productsService = ProductsService;
  }

  /**
   * Analyse un message, repère le client (via abréviations) et les lignes produits.
   * Retourne un tableau d'"orders", ex:
   * [
   *   {
   *     client: { id:"C00013", name:"Boulangerie Aziz (Mileha)", zone:"...", defaultFormat:"1", ...},
   *     products: [ { productId:"C1L", quantity:3 }, ... ]
   *   }
   * ]
   */
  async parseMessage(message) {
    console.log('🔹[MessageParser] parseMessage -> message:', message);

    // Séparer en lignes non vides
    const lines = message
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const orders = [];
    let currentClient = null;

    for (const line of lines) {
      // 1) On essaie de résoudre cette ligne comme abréviation client
      const maybeClient = AbbreviationsService.resolveFullClientData(line);
      if (maybeClient) {
        // On a trouvé un client complet (id, name, zone, defaultFormat, etc.)
        console.log('🔹[MessageParser] Client détecté:', maybeClient);
        currentClient = maybeClient;
        continue; // on passe à la prochaine ligne
      }

      // 2) Sinon, si un client est déjà déterminé, on parse la ligne comme produits
      if (currentClient) {
        const productItems = this.parseProductLine(line, currentClient);
        if (productItems && productItems.length > 0) {
          // On stocke un "order" (client + produits)
          orders.push({
            client: currentClient,
            products: productItems
          });
        }
      }
    }

    // 3) On renvoie la liste des ordres trouvés
    //    S'il est vide, DeepSeekService saura qu'il s'agit d'un message "général"
    return orders;
  }

/**
   * Exemple de parse simplifié : "3 4 5" => [Citron 1L, Mojito 1L, Fraise 1L]
   * À personnaliser selon vos règles (formats 25CL, surgelés, etc.).
   */
parseProductLine(line, client) {
  // On dispose d'un "client.defaultFormat" (ex: "1", "25", ou "5")
  // Convertit en un "format" ex: "1L", "25CL", "5L".
  // On gère un "currentFormat" qu'on met à jour si la ligne dit "25cl", "5l", etc.
  // Pour simplifier, on passera "currentFormat" en param ou on aura un "parserContext".

  // Ex: "3 4 5" => si client.defaultFormat="1" => 3 quantités = [C, M, F, (Red=0)]
  // Ex: "2 c" => 2 Citron (format actuel)
  // Ex: "surgelé" => on bascule un flag isFrozen=true

  // Pour la DEMO, on fait un code minimal, à peaufiner
  const tokens = line.split(/\s+/);

  // 1) Vérifier si la ligne est un mot-clé "surgelé", "25cl", "5l" => on met à jour un "context"
  //    => On suppose ici qu'on gère ça AILLEURS, ex. parseMessage a un "context.currentFormat"
  //    => Sinon, on le fait direct
  if (line.toLowerCase().includes('surgelé')) {
    // ... on bascule sur surgelé
    return [];
  }
  if (line.toLowerCase().includes('25cl')) {
    // ... on change le format
    return [];
  }
  // etc.

  // 2) Si c'est un bloc "3 4 5" => [C, M, F, Red]
  const maybeAllNums = tokens.every(t => !isNaN(parseInt(t, 10)));
  if (maybeAllNums) {
    const nums = tokens.map(n => parseInt(n, 10));
    // ex: [3, 4, 5]
    // On applique la règle du default=1 => => [C1L=3, M1L=4, F1L=5, R1L=0 si besoin]
    return this.parseDefaultBlock(nums, client.defaultFormat);
  }

  // 3) Sinon, on suppose "2 c" => 2 Citron, "1 mj" => 1 Mojito
  //    On parse le 1er token = quantité, 2ᵉ = abréviation, 3ᵉ = format?
  if (tokens.length >= 2) {
    const quantity = parseInt(tokens[0], 10);
    if (isNaN(quantity)) {
      return [];
    }
    const abrev = tokens[1].toLowerCase();
    let localFormat = client.defaultFormat;  // ex: "1"
    // si tokens[2] = "25cl", on override localFormat="25"

    const family = this.getJuiceFamily(abrev); // ex: "M"
    if (!family) return [];
    
    // Compose ID
    const productId = this.buildProductId(family, localFormat, /* isFrozen? */ false);
    return [ { productId, quantity } ];
  }

  return [];
}

/**
 * parseDefaultBlock(nums, defaultFormat=1)
 * ex: [3,4,5] => [ { productId:"C1L", quantity:3}, ... ]
 */
parseDefaultBlock(nums, defaultFormat) {
  // Convert defaultFormat ("1","25","5") => "1L","25CL","5L"
  const baseFormat = this.formatFromDefault(defaultFormat); // ex: '1L'
  
  // Ordre standard : [Citron, Mojito, Fraise, Red]
  const families = ["C", "M", "F", "R"]; 
  // ex: if nums= [3,4,5], then we do families.length=4 => 
  // if there's no 4th number, assume 0
  const out = [];
  for (let i = 0; i < families.length; i++) {
    const q = nums[i] || 0; // si index out of range, 0
    if (q > 0) {
      const productId = this.buildProductId(families[i], baseFormat, false);
      out.push({ productId, quantity: q });
    }
  }
  return out;
}

/**
 * buildProductId(familyCode, format, isFrozen)
 * ex: ("M","1L",false) => "M1L"
 *     ("M","1L",true ) => "M1LS"
 */
buildProductId(familyCode, format, isFrozen) {
  // "M" + "1L" => "M1L"
  // si surgelé => "M1LS"
  let id = familyCode + format;
  if (isFrozen) id += "S";
  return id;
}

/**
 * getJuiceFamily(abrev) => ex: "mj" => "M"
 */
getJuiceFamily(abrev) {
  const familiesMap = require('./JuiceFamilies');
  const entry = familiesMap[abrev]; 
  return entry ? entry.familyCode : undefined;
}

/**
 * formatFromDefault(defVal) => "1" => "1L", "25" => "25CL", "5" => "5L"
 */
formatFromDefault(defVal) {
  if (defVal==="25") return "25CL";
  if (defVal==="5")  return "5L";
  // fallback
  return "1L";
}
}

module.exports = new MessageParser();