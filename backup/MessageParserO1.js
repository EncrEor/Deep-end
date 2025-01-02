/**
 * MessageParser.js (version améliorée)
 * ------------------------------------
 * 1) Détecte le client (et éventuellement une date) dans la ligne.
 * 2) Scinde s’il y a un suffix (ex: "surg", "5L", "1L") sur la même ligne.
 * 3) Applique le surgelé / format, etc.
 * 4) Parse les lignes de chiffres (éventuellement double-ligne).
 * 5) Permet d'interpréter "Surgl 1L", "Fresh surg", "Ksouri du 6 dec", etc.
 */

const ClientsService = require('./ClientsService');
const AbbreviationsService = require('./AbbreviationsService');
const JuiceFamilies = require('./JuiceFamilies');

// Helpers
function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeFormat(fmt) {
  const lower = removeAccents(fmt.toLowerCase());
  if (lower.includes('5l')) return '5L';
  if (lower.includes('25')) return '25CL';
  if (lower.includes('3l')) return '3L';
  if (lower.includes('1l')) return '1L';
  return '1L';
}

function detectDefaultFormat(df) {
  if (df === '5') return '5L';
  if (df === '25') return '25CL';
  return '1L';
}

function buildProductId(familyCode, format, isFrozen) {
  let id = familyCode + format.toUpperCase();
  if (isFrozen) id += 'S';
  return id;
}

function getJuiceFamily(abrev) {
  if (!abrev) return null;
  const normalized = removeAccents(abrev.toLowerCase().trim());
  const entry = JuiceFamilies[normalized];
  return entry ? entry.familyCode : null;
}

/**
 * Cherche tous les nombres d'une ligne + le "dernier mot" éventuel
 * ex: "4 2 2 cool" => numbers=[4,2,2], lastWord="cool"
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
      lastWord = parts[i];
    }
  }
  return { numbers, lastWord };
}

/**
 * Parse un tableau de quantités => produits
 * families = ex: ['C','M','F','R']
 * format, isFrozen, + lastWord => si 5ᵉ qty
 */
function parseQuantitiesWithDefaultFamilies(numbers, families, format, isFrozen, lastWord) {
  const products = [];

  for (let i = 0; i < Math.min(numbers.length, families.length); i++) {
    const qty = numbers[i];
    if (qty > 0) {
      products.push({
        productId: buildProductId(families[i], format, isFrozen),
        quantity: qty
      });
    }
  }

  // 5ᵉ slot ?
  if (numbers.length > families.length) {
    const extraQty = numbers[families.length];
    if (extraQty > 0) {
      let fc = lastWord ? getJuiceFamily(lastWord) : null;
      if (!fc) fc = 'CL'; // fallback => COOL
      products.push({
        productId: buildProductId(fc, format, isFrozen),
        quantity: extraQty
      });
    }
  }

  return products;
}

function parseSingleNumbersLine(line, context) {
  const { numbers, lastWord } = parseNumbersAndMaybeWord(line);

  const clientDF = context.currentClient?.defaultFormat || '1';
  const isDF5 = (clientDF === '5');

  // cas: si default=5 ET 2 chiffres => [F5L, C5L]
  if (isDF5 && numbers.length === 2) {
    const [qtyF, qtyC] = numbers;
    const products = [];
    if (qtyF > 0) {
      products.push({ productId: buildProductId('F','5L',context.isFrozen), quantity: qtyF });
    }
    if (qtyC > 0) {
      products.push({ productId: buildProductId('C','5L',context.isFrozen), quantity: qtyC });
    }
    return products;
  }

  // sinon on applique currentFormat
  let format = context.currentFormat || '1L';

  // families = [C,M,F,R]
  const families = ['C','M','F','R'];
  return parseQuantitiesWithDefaultFamilies(numbers, families, format, context.isFrozen, lastWord);
}

function parsePotentialDoubleLine(line, nextLine, context) {
  const firstProducts = parseSingleNumbersLine(line, context);

  if (!nextLine) {
    return { products: firstProducts, consumedNextLine: false };
  }

  // Check if nextLine is also numeric
  const { numbers: nxtNums } = parseNumbersAndMaybeWord(nextLine);
  if (nxtNums.length === 0) {
    return { products: firstProducts, consumedNextLine: false };
  }

  // => 2ᵉ ligne = format 25CL
  const savedFormat = context.currentFormat;
  context.currentFormat = '25CL';

  const secondProducts = parseSingleNumbersLine(nextLine, context);

  // restore format
  context.currentFormat = savedFormat;

  return {
    products: [...firstProducts, ...secondProducts],
    consumedNextLine: true
  };
}

/**
 * parseClientAndSuffix(line) => { clientFound, clientName, suffix } 
 *  - Ex: "Fresh surg" => clientFound=Yes, clientName="Fresh", suffix="surg"
 *  - Ex: "Ksouri du 6 dec Surgelees" => client="Ksouri du 6 dec", suffix="Surgelees"
 *  - Ex: "Bgh ennasr" => suffix=""
 */
function parseClientAndSuffix(line) {
  const tokens = line.split(/\s+/);
  // on va essayer de trouver le plus long préfix qui match un client
  // ex: "Ksouri du 6 dec" => client
  // Reste => "Surgelees"

  // On tente par l'ensemble, puis on raccourcit à la fin
  for (let cutIndex = tokens.length; cutIndex > 0; cutIndex--) {
    const clientCandidate = tokens.slice(0, cutIndex).join(' ');
    const maybeClient = AbbreviationsService.resolveFullClientData(clientCandidate);

    if (maybeClient) {
      const suffix = tokens.slice(cutIndex).join(' ').trim();
      return {
        clientFound: true,
        clientData: maybeClient,
        suffix
      };
    }
  }

  // sinon
  return {
    clientFound: false,
    clientData: null,
    suffix: ''
  };
}


/* ============================
   Règles
   ============================ */

/**
 * Règle 1: "Retour" ou "+client" => on ne match pas ici
 * On détecte s'il y a un client + suffix sur la même ligne
 */
async function ruleDetectClientWithSuffix(line, context) {
  const lower = line.toLowerCase();
  if (lower.startsWith('retour') || lower.startsWith('+')) {
    return { matched: false };
  }

  const parsed = parseClientAndSuffix(line);
  if (!parsed.clientFound) {
    return { matched: false };
  }

  // matched
  return {
    matched: true,
    newOrder: true,
    resetContext: true,
    contextUpdates: {
      currentClient: parsed.clientData,
      currentFormat: detectDefaultFormat(parsed.clientData.defaultFormat),
      isFrozen: false,
      isReturn: false
    },
    // On repasse le suffix à un mini parse (pour "surg", "1L", "5L", etc.)
    postProcess: parsed.suffix // on stocke ça pour la suite
  };
}

/**
 * Règle 2: '+client'
 */
async function ruleNewOrder(line, context) {
  const lower = line.trim().toLowerCase();
  if (!lower.startsWith('+')) return { matched: false };

  const clientName = line.slice(1).trim();
  const cData = AbbreviationsService.resolveFullClientData(clientName);
  if (!cData) return { matched: false };

  return {
    matched: true,
    newOrder: true,
    resetContext: true,
    contextUpdates: {
      currentClient: cData,
      currentFormat: detectDefaultFormat(cData.defaultFormat),
      isFrozen: false,
      isReturn: false
    }
  };
}

/**
 * Règle 3: "Retour..."
 */
async function ruleRetour(line, context) {
  const lower = line.toLowerCase();
  if (!lower.startsWith('retour')) return { matched: false };

  let newClient = context.currentClient;
  const splitted = line.slice(6).trim(); // remove 'retour'

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
 * Règle 4: Format (5L, 25cl, 1L, 3L) ou Surgelé dans la ligne
 * - ex: "Surgl 1L" => isFrozen=true, format=1L
 */
function ruleFormatOrSurg(line, context) {
  // On parse token par token
  const tokens = line.split(/\s+/);
  let updates = {};
  let matched = false;

  for (const token of tokens) {
    const tNorm = removeAccents(token.toLowerCase());
    if (tNorm.includes('surg')) {
      matched = true;
      updates.isFrozen = true;
    }
    // "frais" => isFrozen=false
    else if (tNorm === 'frais') {
      matched = true;
      updates.isFrozen = false;
    }
    // Formats
    else if (['5l','25cl','1l','3l'].includes(tNorm)) {
      matched = true;
      updates.currentFormat = normalizeFormat(tNorm);
    }
  }

  if (!matched) {
    return { matched: false };
  }

  return {
    matched: true,
    contextUpdates: updates
  };
}

/**
 * Règle 5: "qty abrev [format]"
 */
function ruleQuantityProduct(line, context) {
  // Exemple de regex: "(\d+)\s+([a-z0-9]+)(\s+[a-z0-9]+)?"
  const re = /^(\d+)\s+([\w\-_]+)(?:\s+([\w\-_]+))?$/i;
  const match = line.match(re);
  if (!match) return { matched: false };

  const qty = parseInt(match[1], 10);
  const abrev = removeAccents(match[2].toLowerCase());
  let fm = match[3] ? normalizeFormat(match[3]) : null;

  const fam = getJuiceFamily(abrev);
  if (!fam) return { matched: false };

  const finalFormat = fm || context.currentFormat;
  const productId = buildProductId(fam, finalFormat, context.isFrozen);
  const product = { productId, quantity: qty };

  return {
    matched: true,
    contextUpdates: {
      currentProducts: [...context.currentProducts, product]
    }
  };
}

/**
 * Règle 6: "ligne de chiffres" => potentiellement double-ligne
 */
function ruleNumbersLine(line, context, nextLine) {
  const { numbers } = parseNumbersAndMaybeWord(line);
  if (numbers.length === 0) {
    return { matched: false };
  }

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
 * L'ordre de parsing
 */
const parsingRules = [
  // 1. client + suffix
  ruleDetectClientWithSuffix,
  // 2. +client
  ruleNewOrder,
  // 3. retour
  ruleRetour,
  // 4. format / surgelé
  ruleFormatOrSurg,
  // 5. qty abrev
  ruleQuantityProduct,
  // 6. ligne de chiffres
  (line, context, nextLine) => ruleNumbersLine(line, context, nextLine)
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
      currentFormat: '1L',
      isFrozen: false,
      isReturn: false
    };
  }

  closeCurrentOrder() {
    if (this.context.currentClient && this.context.currentProducts.length > 0) {
      const newOrder = {
        client: this.context.currentClient,
        products: this.context.currentProducts,
        type: this.context.isReturn ? 'return' : 'delivery'
      };
      // Log
      console.log('[MessageParser] Closing order =>', JSON.stringify(newOrder));
      this.orders.push(newOrder);
      this.context.currentProducts = [];
    }
  }

  async parseMessage(message) {
    this.reset();

    let lines = message
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let nextLine = i < lines.length - 1 ? lines[i + 1] : null;

      let matched = false;
      let postProcessSuffix = null;

      for (const rule of parsingRules) {
        const result = await rule(line, this.context, nextLine);

        if (result.matched) {
          matched = true;

          // newOrder => close la commande courante
          if (result.newOrder) {
            this.closeCurrentOrder();
          }

          // resetContext => on réinitialise le state + applique les updates
          if (result.resetContext) {
            let newC = result.contextUpdates.currentClient || null;
            let newF = result.contextUpdates.currentFormat || '1L';
            let newFrozen = !!result.contextUpdates.isFrozen;
            let newReturn = !!result.contextUpdates.isReturn;

            this.context = this.createEmptyContext();
            this.context.currentClient = newC;
            this.context.currentFormat = newF;
            this.context.isFrozen = newFrozen;
            this.context.isReturn = newReturn;
          }

          // contextUpdates => on merge
          if (result.contextUpdates) {
            for (const [k,v] of Object.entries(result.contextUpdates)) {
              if (k === 'currentProducts') {
                this.context.currentProducts = v;
              } else {
                this.context[k] = v;
              }
            }
          }

          // postProcess => pour ruleDetectClientWithSuffix : si suffix => re-parse
          if (result.postProcess) {
            postProcessSuffix = result.postProcess; 
          }

          if (result.skipNextLine) {
            i++;
          }
          break;
        }
      }

      // Si matched = false => on ignore la ligne
      // Mais si on a postProcessSuffix => on le traite
      if (matched && postProcessSuffix) {
        // On tente un parsing "à la volée" sur la même ligne
        // comme si c'était une nouvelle "mini-ligne"
        await this.parseSuffixLine(postProcessSuffix);
      }
    }

    // Fin => close la dernière commande
    this.closeCurrentOrder();
    return this.orders;
  }

  /**
   * parseSuffixLine(suffix) => on ré-applique les règles "formatOrSurg", "qty abrev", "chiffres", etc.
   * Sauf la détection client/newOrder/retour
   */
  async parseSuffixLine(suffix) {
    // On va exécuter un *sous-ensemble* de règles : formatOrSurg, qtyAbrev, numbersLine
    // Car on ne veut pas retomber sur "client" => newOrder.
    // Ni "retour" => newOrder, etc.
    const localRules = [
      ruleFormatOrSurg,
      ruleQuantityProduct,
      (line, context) => ruleNumbersLine(line, context)
    ];

    let line = suffix.trim();
    if (!line) return;

    let matchedSomething = true; // pour boucler tant qu'on matche
    // on peut imaginer découper le suffix en tokens successifs,
    // mais la plupart du temps c'est 1 ou 2 tokens ("surg 1L").
    // Pour rester simple, on le traite en un bloc.

    // On limite à 2 ou 3 itérations maximum pour éviter une boucle infinie
    for (let attempt=0; attempt<3; attempt++) {
      matchedSomething = false;
      for (const rule of localRules) {
        const res = await rule(line, this.context, null);
        if (res.matched) {
          matchedSomething = true;

          if (res.contextUpdates) {
            for (const [k,v] of Object.entries(res.contextUpdates)) {
              if (k==='currentProducts') {
                this.context.currentProducts = v;
              } else {
                this.context[k] = v;
              }
            }
          }
          // s'il restait un skipNextLine => pas applicable ici
          break;
        }
      }
      if (!matchedSomething) break;
    }
  }
}

module.exports = new MessageParser();