/**
 * /services/AbbreviationsService.js
 * ---------------------------------
 * Cette classe centralise la gestion des abréviations pour :
 *  - Les clients (ex: "aziz" -> "Boulangerie Aziz")
 *  - Les produits (ex: "f" -> "Fraise 1L", "f surgelé" -> "Fraise 1L Surgelé")
 *  - Les formats spéciaux (ex: "25cl", "5l", "surgelé", etc.)
 *
 * À terme, on pourra remplir ce service au démarrage du backend,
 * pour éviter de faire trop d'allers-retours. On y stockera :
 *   - clientsMap (abréviation -> informations client)
 *   - productsMap (abréviation -> informations produit)
 */

class AbbreviationsService {
  constructor() {
    // Maps pour abréviations
    this.clientsMap = new Map();
    this.productsMap = new Map();
  }

  /**
   * Charge la feuille "abrev.clients" et enregistre les abréviations clients.
   *
   * Hypothèse : la feuille "abrev.clients" possède une 1ʳᵉ ligne (header) du type :
   *   Nom_Client | AB1 | AB2 | AB3 | AB4 | AB5 | AB6
   *
   * Exemple de contenu :
   *   Nom_Client                 | AB1         | AB2         | ...
   *   Boulangerie Aziz (Mileha) | Aziz        |
   *   BGH Ennasr                | Bgh nasr    | Bgh ennasr
   *   ...
   *
   * Pour chaque ligne, on stocke dans this.clientsMap :
   *   - key = abréviation en minuscules
   *   - value = { clientId: "Nom_Client", name: "Nom_Client", defaultFormat: "1" }
   *     (Ici, on n’a pas d’ID distinct. On peut faire un "join" plus tard si besoin.)
   */
  async loadClientAbbreviations() {
    console.log('🟩 [AbbreviationsService] Chargement abréviations "abrev.clients"...');
    const GoogleSheetsService = require('./GoogleSheetsService');

    // rows contiendra un tableau d'objets, par ex:
    // [ { ID_Client: "C00013", Nom_Client: "Boulangerie Aziz (Mileha)", AB1: "Aziz", AB2: "", ...}, ...]
    const rows = await GoogleSheetsService.getRows('abrev.clients');
    //console.log(`🟩 [AbbreviationsService] Nombre de lignes abrev.clients: ${rows.length}`);

    rows.forEach((row, index) => {
      const idClient = row.ID_Client || '';      // "C00013"
      const nomClient = row.Nom_Client || '';    // "Boulangerie Aziz (Mileha)"

      // On récupère AB1..AB6
      const abList = [row.AB1, row.AB2, row.AB3, row.AB4, row.AB5, row.AB6].filter(Boolean);

      // On crée un 'clientData' minimal (on complétera en "join" si on veut plus tard)
      // Ex: { clientId: "C00013", name: "Boulangerie Aziz (Mileha)" }
      const clientData = {
        clientId: idClient,
        name: nomClient
      };

      abList.forEach(ab => {
        const key = ab.toLowerCase().trim();
        this.clientsMap.set(key, clientData);
        //console.log(`    🟩 Ajout abrév="${key}" -> ID=${idClient}`);
      });
    });

    console.log('🟩 [AbbreviationsService] Fin chargement abrev.clients.');
  }

  /**
   * Charge la feuille "abrev.produits" et enregistre les abréviations produits.
   * Colonnes attendues (exemple):
   *  - 'ID_Produit' : ID du produit (ex: "C1L")
   *  - 'abrev'      : L'abréviation (ex: "c" ou "c1" ou "citron" etc.)
   */
  async loadProductAbbreviations() {
    console.log('🟩 [AbbreviationsService] Chargement des abréviations depuis "abrev.produits"...');

    // 1. On importe GoogleSheetsService
    const GoogleSheetsService = require('./GoogleSheetsService');

    // 2. Récupère les lignes
    const rows = await GoogleSheetsService.getRows('abrev.produits');
    //console.log(`🟩 [AbbreviationsService] Nombre de lignes "abrev.produits": ${rows.length}`, rows);

    // 3. On itère
    rows.forEach((row, index) => {
      // Hypothèse: row.ID_Produit, row.abrev
      const prodId = row.ID_Produit || '';
      const abrev = row.abrev || '';

      if (!abrev.trim()) return;

      const key = abrev.toLowerCase().trim();

      // On stocke dans productsMap
      // On ne sait pas encore tout du produit (format, isFrozen, etc.),
      // mais on peut au moins mémoriser l'ID pour qu'on aille plus tard
      // le récupérer dans ProductsService.products (si besoin).
      const productData = {
        productId: prodId
      };

      this.productsMap.set(key, productData);

      console.log(`    🟩 Ajout produit abrév="${key}" => ${JSON.stringify(productData)}`);
    });

    console.log('🟩 [AbbreviationsService] Fin chargement abrev.produits.');
  }

  async initialize() {
    console.log('🟩 [AbbreviationsService] initialize() - Début');

    // On charge d'abord le Map des clients
    await this.loadClientAbbreviations();

    // Puis le Map des produits
    await this.loadProductAbbreviations();

    console.log('🟩 [AbbreviationsService] initialize() - Fin');
  }

  /**
   * Recherche un client par abréviation
   * @param {string} abr L'abréviation en minuscules
   * @returns {Object|undefined} un objet { clientId, name, defaultFormat } ou undefined si non trouvé
   */
  findClient(abr) {
    const key = abr.toLowerCase().trim();
    return this.clientsMap.get(key);
  }

  /**
   * Recherche un produit par abréviation
   * (Ex: "f" -> { productId: 'F1L', name: 'Fraise 1L', ... })
   * @param {string} abr
   * @returns {Object|undefined}
   */
  findProduct(abr) {
    const key = abr.toLowerCase().trim();
    return this.productsMap.get(key);
  }

  /**
   * Effectue une recherche "fuzzy" de l'abr client
   * @param {string} abr - abréviation qu'on cherche (ex: "bgh an")
   * @param {number} maxDistance - distance max de correction (ex: 2)
   * @returns {Object|undefined} - { clientId, name, defaultFormat } s'il trouve
   */
  fuzzyFindClient(abr, maxDistance = 2) {
    // 1. Normaliser l'entrée
    const input = abr.toLowerCase().trim();

    let bestKey = null;
    let bestDistance = Infinity;

    // 2. Parcourir toutes les clés
    for (const [key, clientObj] of this.clientsMap.entries()) {
      const dist = this.levenshteinDistance(input, key);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestKey = key;
      }
    }

    // 3. Si la meilleure distance est <= maxDistance, on le retourne
    if (bestKey && bestDistance <= maxDistance) {
      console.log(`🔎 [AbbreviationsService] fuzzyFindClient("${abr}") => found "${bestKey}" (distance=${bestDistance})`);
      return this.clientsMap.get(bestKey);
    }

    // Sinon rien
    return undefined;
  }

  /**
   * Calcule la distance de Levenshtein entre deux chaînes
   * Source simplifiée
   */
  levenshteinDistance(a, b) {
    const matrix = [];

    // Si l'une est vide
    const lenA = a.length;
    const lenB = b.length;
    if (!lenA) return lenB;
    if (!lenB) return lenA;

    // Init 1ère colonne/ligne
    for (let i = 0; i <= lenA; i++) {
      matrix[i] = [i];
    }
    for (let j = 1; j <= lenB; j++) {
      matrix[0][j] = j;
    }

    // Remplir la matrice
    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,    // deletion
          matrix[i][j - 1] + 1,    // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[lenA][lenB];
  }

  /**
   * Renvoie un objet "client complet" à partir d'une abréviation (ex: "aziz").
   * - On cherche d'abord l'ID_Client correspondant dans this.clientsMap (issu de abrev.clients)
   * - Puis on cherche dans ClientsService.clients l'objet complet (zone, defaultFormat, etc.)
   */
  resolveFullClientData(abbreviation) {
    console.log(`[resolveFullClientData] Reçu: "${abbreviation}"`);
    
    // 1) Essai direct
    let partialClient = this.findClient(abbreviation);
  
    // 2) Essai fuzzy
    if (!partialClient) {
      partialClient = this.fuzzyFindClient(abbreviation, 2);
      // log utile pour debug
      if (partialClient) {
        console.log(`[resolveFullClientData] Fuzzy match trouvé pour "${abbreviation}":`, partialClient);
      } else {
        console.log(`[resolveFullClientData] -> undefined (pas trouvé même en fuzzy)`);
        return undefined;
      }
    }
  
    // 3) Join avec ClientsService
    const ClientsService = require('./ClientsService');
    const fullClient = ClientsService.clients.find(
      c => c.id === partialClient.clientId
    );
  
    if (!fullClient) {
      // On n'a pas trouvé dans la table clients => on renvoie déjà partialClient
      console.log(`[resolveFullClientData] Aucune correspondance ID_CLIENT="${partialClient.clientId}" dans ClientsService`);
      return partialClient;
    }
  
    // 4) Fusion
    return {
      id: fullClient.id,           
      name: fullClient.name,       
      zone: fullClient.zone,
      modeComptable: fullClient.modeComptable,
      defaultFormat: fullClient.defaultFormat || '1',
  
      allNames: {
        officialName: fullClient.name,
        abrevName: partialClient.name
      }
    };
  }
}
module.exports = new AbbreviationsService();