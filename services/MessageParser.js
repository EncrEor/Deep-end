/**
 * MessageParser.js
 * ----------------
 * Parser modulaire et extensible pour interpréter les messages de livraison/retour
 * en se basant sur un ensemble de règles successives.
 *
 * Principes clés:
 *  - Chaque "bloc" commence par un client (ou "+client" ou "Retour client")
 *  - On tient compte du "DEFAULT" du client (1,5,25) pour parser la première ligne de chiffres
 *  - Si 2 lignes de chiffres successives: la première est en 1L (ou 5L si 2 chiffres & default=5),
 *    la deuxième est en 25CL (sauf indication format explicite).
 *  - Mots-clés "5L", "25cl", "1L" changent le format courant
 *  - Mots-clés "Surgelé" ou "Frais" activent/désactivent isFrozen
 *  - "Retour" crée une nouvelle commande type=return
 *  - "+client" crée une nouvelle commande pour un autre client
 *  - On gère la 5ᵉ (ou 6ᵉ) colonne (COOL, MG, etc.) si nombre de chiffres > 4
 */

const ClientsService = require('./ClientsService');
const AbbreviationsService = require('./AbbreviationsService');
const JuiceFamilies = require('./JuiceFamilies');

// Juste un helper pour nettoyer les accents
function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Normalise un format textual ('1L', '25CL', '5l', '3L' etc.) vers '1L', '25CL', '5L', '3L'...
function normalizeFormat(fmt) {
  if (!fmt) return '1L';
  const lower = fmt.toLowerCase();
  if (lower.includes('5l')) return '5L';
  if (lower.includes('25')) return '25CL';
  if (lower.includes('3l')) return '3L';
  // fallback
  return '1L';
}

/**
 * En fonction du "client.defaultFormat" (1, 5, 25, ...), on détermine
 * le format "1L", "5L" ou "25CL" par défaut.
 */
function detectDefaultFormat(defaultFormat) {
  if (defaultFormat === '5') return '5L';
  if (defaultFormat === '25') return '25CL';
  return '1L';
}

/**
 * Construit l'ID produit final, ex: "C1LS" (Citron 1L Surgelé).
 *  - familyCode: ex "C", "M", "F", "R", "MG", ...
 *  - format: ex: "1L", "25CL", "5L", ...
 *  - isFrozen: bool
 */
function buildProductId(familyCode, format, isFrozen) {
  let id = familyCode + format.toUpperCase();
  if (isFrozen) id += 'S'; // Ajouter suffixe "S"
  return id;
}

/**
 * Tente de retrouver le "familyCode" (ex: "C", "M") depuis l'abréviation
 * en s'appuyant sur JuiceFamilies (on peut rajouter un fuzzy si besoin).
 */
function getJuiceFamily(abrev) {
  if (!abrev) return null;
  const normalized = removeAccents(abrev.toLowerCase().trim());
  const entry = JuiceFamilies[normalized];
  return entry ? entry.familyCode : null;
}

/**
 * Détecte si une ligne est principalement "des chiffres" ou "x y z abrev"
 * On va renvoyer la liste des nombres trouvés, + éventuellement la dernière mention
 * ex: "4 3 0 2cool" => numbers=[4,3,0,2], extraWord="cool"
 */
function parseNumbersAndMaybeWord(line) {
  const parts = line.split(/\s+/);
  const numbers = [];
  let lastWord = null;

  for (let i = 0; i < parts.length; i++) {
    const val = parseInt(parts[i], 10);
    if (!isNaN(val)) {
      numbers.push(val);
    } else {
      // c'est peut-être un abréviation "cool", "mg", etc.
      lastWord = parts[i];
    }
  }
  return { numbers, lastWord };
}

/**
 * Convertit un tableau de quantités => liste de produits
 * families (ex: ['C','M','F','R']), format, isFrozen
 * on gère l'éventuel 5ᵉ produit => COOL (CL) ou on regarde lastWord
 */
function parseQuantitiesWithDefaultFamilies(numbers, families, format, isFrozen, lastWord) {
  const products = [];
  // On prend le minimum du length
  for (let i = 0; i < Math.min(numbers.length, families.length); i++) {
    const qty = numbers[i];
    if (qty > 0) {
      products.push({
        productId: buildProductId(families[i], format, isFrozen),
        quantity: qty
      });
    }
  }

  // S'il reste un 5ᵉ nombre
  if (numbers.length > families.length) {
    const extraQty = numbers[families.length];
    if (extraQty > 0) {
      // Soit on a un 'lastWord' qui correspond à une abréviation
      let familyCode = lastWord ? getJuiceFamily(lastWord) : null;
      if (!familyCode) {
        // fallback => COOL
        familyCode = 'CL';
      }
      products.push({
        productId: buildProductId(familyCode, format, isFrozen),
        quantity: extraQty
      });
    }
  }

  return products;
}

/**
 * Parse une ligne de chiffres en tenant compte du DEFAULT
 * - Si DEFAULT=5 et qu'on voit 2 chiffres => [F5L, C5L]
 * - Sinon si 4 chiffres => [C,M,F,R]
 * - Si 5ᵉ => COOL ou abréviation si lastWord
 *
 * On renvoie un tableau de { productId, quantity }.
 */
function parseSingleNumbersLine(line, context) {
  const { numbers, lastWord } = parseNumbersAndMaybeWord(line);

  // Si le client a default=5 (=> format=5L) et qu'on trouve EXACTEMENT 2 chiffres => [F, C]
  const clientDefault = context.currentClient?.defaultFormat || '1';
  const isDefault5 = (clientDefault === '5');

  if (isDefault5 && numbers.length === 2) {
    // Interprétation [F5L, C5L]
    const [qtyF, qtyC] = numbers;
    const products = [];
    if (qtyF > 0) {
      products.push({
        productId: buildProductId('F', '5L', context.isFrozen),
        quantity: qtyF
      });
    }
    if (qtyC > 0) {
      products.push({
        productId: buildProductId('C', '5L', context.isFrozen),
        quantity: qtyC
      });
    }
    return products;
  }

  // Sinon on détermine si c'est 1L ou 25CL par le "format courant"
  // (Par défaut, la 1ère ligne => '1L', la 2ᵉ => '25CL' si c'est un double-ligne.)
  const format = context.currentFormat || '1L';

  // families = 4 : [C, M, F, R]
  // On parse
  const families = ['C', 'M', 'F', 'R'];
  return parseQuantitiesWithDefaultFamilies(numbers, families, format, context.isFrozen, lastWord);
}

/**
 * Gère la logique "double-ligne" => si nextLine est aussi numeric
 * => 1ère = format 1L (ou 5L si 2 chiffres + default=5), 2ᵉ = 25CL ...
 */
function parsePotentialDoubleLine(line, nextLine, context) {
  // 1ère ligne
  const firstProducts = parseSingleNumbersLine(line, context);

  // S'il n'y a pas de nextLine, on s'arrête là
  if (!nextLine) {
    return { products: firstProducts, consumedNextLine: false };
  }

  // Vérif si nextLine est numeric
  const { numbers: nextNumbers } = parseNumbersAndMaybeWord(nextLine);
  if (nextNumbers.length === 0) {
    // Pas numeric => on s'arrête
    return { products: firstProducts, consumedNextLine: false };
  }

  // => On considère la 2ᵉ ligne en "25CL" (sauf si un mot-clé change le format)
  // On va forcer context.currentFormat = '25CL' pour la 2ᵉ
  let savedFormat = context.currentFormat;
  context.currentFormat = '25CL';

  const secondProducts = parseSingleNumbersLine(nextLine, context);

  // On restore l'ancien format pour la suite
  context.currentFormat = savedFormat;

  // On concat
  const allProducts = [...firstProducts, ...secondProducts];
  return { products: allProducts, consumedNextLine: true };
}

/* ============================
   Règles "ruleXXX" réutilisables
   ============================ */

/**
 * Règle 1: Détecter si la ligne est un client "classique"
 * - on ignore si la ligne commence par "+" ou "retour"
 * - on fait un resolveFullClientData
 * - si trouvé => newOrder, resetContext
 */
async function ruleDetectClient(line, context) {
  const lower = line.toLowerCase();
  if (lower.startsWith('retour') || lower.startsWith('+')) {
    return { matched: false };
  }

  // Tente de résoudre le client
  const potentialClient = AbbreviationsService.resolveFullClientData(line);
  if (!potentialClient) {
    return { matched: false };
  }

  // matched
  return {
    matched: true,
    newOrder: true,
    resetContext: true,
    contextUpdates: {
      currentClient: potentialClient,
      // le format par défaut
      currentFormat: detectDefaultFormat(potentialClient.defaultFormat),
      isFrozen: false,
      isReturn: false
    }
  };
}

/**
 * Règle 2: "+client" => nouvelle commande
 */
async function ruleNewOrder(line, context) {
  const lower = line.trim().toLowerCase();
  if (!lower.startsWith('+')) return { matched: false };

  const clientName = line.slice(1).trim();
  const potentialClient = AbbreviationsService.resolveFullClientData(clientName);
  if (!potentialClient) {
    // pas trouvé => matched=false
    return { matched: false };
  }

  return {
    matched: true,
    newOrder: true,
    resetContext: true,
    contextUpdates: {
      currentClient: potentialClient,
      currentFormat: detectDefaultFormat(potentialClient.defaultFormat),
      isFrozen: false,
      isReturn: false
    }
  };
}

/**
 * Règle 3: "Retour ..."
 * - S'il y a un nom de client après "Retour", on l'associe
 * - Sinon, on reste sur le même client
 * - newOrder, type=return
 */
async function ruleRetour(line, context) {
  const lower = line.toLowerCase();
  if (!lower.startsWith('retour')) return { matched: false };

  // On ferme la commande en cours, on en ouvre une nouvelle
  let newClient = context.currentClient;
  // extra text
  const splitted = line.slice(6).trim(); // enlevant "retour"

  if (splitted) {
    const maybeClient = AbbreviationsService.resolveFullClientData(splitted);
    if (maybeClient) {
      newClient = maybeClient;
    }
  }

  return {
    matched: true,
    newOrder: true,
    resetContext: true,
    contextUpdates: {
      currentClient: newClient,
      currentFormat: newClient ? detectDefaultFormat(newClient.defaultFormat) : '1L',
      isFrozen: false,
      isReturn: true
    }
  };
}

/**
 * Règle 4: Format explicite (5L, 25CL, 1L, 3L, ...)
 */
function ruleFormat(line, context) {
  const norm = removeAccents(line.toLowerCase().trim());
  if (norm === '5l') {
    return { matched: true, contextUpdates: { currentFormat: '5L' } };
  }
  if (norm === '25cl') {
    return { matched: true, contextUpdates: { currentFormat: '25CL' } };
  }
  if (norm === '1l') {
    return { matched: true, contextUpdates: { currentFormat: '1L' } };
  }
  if (norm === '3l') {
    return { matched: true, contextUpdates: { currentFormat: '3L' } };
  }
  return { matched: false };
}

/**
 * Règle 5: Surgelé ou Frais
 */
function ruleSurgeline(line, context) {
  const norm = removeAccents(line.toLowerCase());
  if (norm.includes('surgel')) {
    return { matched: true, contextUpdates: { isFrozen: true } };
  }
  if (norm.includes('frais')) {
    return { matched: true, contextUpdates: { isFrozen: false } };
  }
  return { matched: false };
}

/**
 * Règle 6: "qty abrev [format]" => ex: "2 f 1L", "1 red 25cl"
 * - On vérifie s'il y a un pattern (\\d+)(\\s+)([a-z0-9]+)(\\s+format?)
 */
function ruleQuantityProduct(line, context) {
  // Pattern approximatif
  const regex = /^(\d+)\s+([\w\-\+]+)(?:\s+([\w]+))?$/i;
  const match = line.match(regex);
  if (!match) return { matched: false };

  const qty = parseInt(match[1], 10);
  const abrev = removeAccents(match[2].toLowerCase());
  let explicitFormat = match[3] ? normalizeFormat(match[3]) : null;

  // On cherche le familyCode
  const familyCode = getJuiceFamily(abrev);
  if (!familyCode) {
    // on n'a pas trouvé => matched=false
    return { matched: false };
  }

  // si pas de format explicite, on prend currentFormat
  const finalFormat = explicitFormat || context.currentFormat;
  const productId = buildProductId(familyCode, finalFormat, context.isFrozen);
  const product = { productId, quantity: qty };

  return {
    matched: true,
    contextUpdates: {
      currentProducts: [...context.currentProducts, product]
    }
  };
}

/**
 * Règle 7: "ligne de chiffres" => peut-être double-ligne
 *  - On va essayer parsePotentialDoubleLine
 */
function ruleNumbersLine(line, context, nextLine) {
  // On regarde s'il y a au moins un nombre
  const { numbers } = parseNumbersAndMaybeWord(line);
  if (numbers.length === 0) {
    return { matched: false };
  }

  // On tente parsePotentialDoubleLine
  const { products, consumedNextLine } = parsePotentialDoubleLine(line, nextLine, context);

  return {
    matched: true,
    skipNextLine: consumedNextLine,
    contextUpdates: {
      currentProducts: [...context.currentProducts, ...products]
    }
  };
}

/**
 * Ordre global des règles
 */
const parsingRules = [
  ruleDetectClient,
  ruleNewOrder,
  ruleRetour,
  ruleFormat,
  ruleSurgeline,
  ruleQuantityProduct,
  // On met la règle "numbersLine" en dernier pour éviter collisions
  (line, context, nextLine) => ruleNumbersLine(line, context, nextLine),
];

class MessageParser {
  constructor() {
    this.reset();
  }

  reset() {
    this.orders = [];
    this.context = this.createEmptyContext();
  }

  createEmptyContext() {
    return {
      currentClient: null,
      currentProducts: [],
      isFrozen: false,
      currentFormat: '1L',
      isReturn: false
    };
  }

  /**
   * Ferme la commande en cours s'il y a un client et des produits
   */
  closeCurrentOrder() {
    if (this.context.currentClient && this.context.currentProducts.length > 0) {
      const newOrder = {
        client: this.context.currentClient,
        products: this.context.currentProducts,
        type: this.context.isReturn ? 'return' : 'delivery'
      };
      console.log(`[MessageParser] Closing order: ${JSON.stringify(newOrder, null, 2)}`);
      this.orders.push(newOrder);

      // reset partiel des products
      this.context.currentProducts = [];
    }
  }

  /**
   * Parse le message complet (plusieurs lignes)
   */
  async parseMessage(message) {
    // Ré-initialiser
    this.reset();

    // Découper en lignes
    const rawLines = message
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const nextLine = i < rawLines.length - 1 ? rawLines[i + 1] : null;

      let matchedSomeRule = false;

      for (const rule of parsingRules) {
        const result = await rule(line, this.context, nextLine);
        if (result.matched) {
          matchedSomeRule = true;

          // Si la règle déclare "newOrder", on ferme la commande précédente
          if (result.newOrder) {
            this.closeCurrentOrder();
          }

          // Si la règle déclare "resetContext", on ré-initialise,
          // puis on applique les contextUpdates
          if (result.resetContext) {
            // On sauvegarde la new client & co...
            const c = result.contextUpdates.currentClient || null;
            const f = result.contextUpdates.currentFormat || '1L';
            const fr = !!result.contextUpdates.isFrozen;
            const ret = !!result.contextUpdates.isReturn;

            this.context = this.createEmptyContext();

            // ré-appliquer
            this.context.currentClient = c;
            this.context.currentFormat = f;
            this.context.isFrozen = fr;
            this.context.isReturn = ret;
          }

          // Appliquer les contextUpdates
          if (result.contextUpdates) {
            for (const [k, v] of Object.entries(result.contextUpdates)) {
              if (k === 'currentProducts') {
                this.context.currentProducts = v;
              } else {
                this.context[k] = v;
              }
            }
          }

          // skipNextLine
          if (result.skipNextLine) {
            i++;
          }
          break; // arrête la boucle des règles (on ne teste pas les suivantes)
        }
      }

      if (!matchedSomeRule) {
        // On ignore la ligne, ou log
        console.log(`[MessageParser] Aucune règle matchée pour la ligne: "${line}"`);
      }
    }

    // Fin: on ferme la dernière commande s'il y en a
    this.closeCurrentOrder();
    return this.orders;
  }
}

module.exports = new MessageParser();