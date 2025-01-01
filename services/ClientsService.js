const GoogleSheetsService = require('../services/GoogleSheetsService');

class ClientsService {
  constructor() {
    this.clients = [];
  }

/**
 * Initialise la liste des clients depuis la feuille "clients".
 * Ici, la feuille "clients" a des colonnes comme :
 *  - ID
 *  - Nom_Client
 *  - zone
 *  - Actif
 *  - Mode_comptable
 *  - CYCLE
 *  - Lat_sold_Date
 *  - Paid
 *  - Next_sold_date
 *  - Billing_period
 *  - PAY_MODE
 *  - PAY_DELAY
 *  - LAST_PAY_DATE
 *  - Tel
 *  - Adresse
 *  - DEFAULT
 *
 * Attention : elle n'a PAS de colonnes AB1, AB2... 
 * Celles-ci se trouvent dans l'autre sheet "abrev.clients".
 */
async initialize() {
  console.log('🟦 [ClientsService] Initialisation des clients...');
  try {
    // 1) Récupérer toutes les lignes de la feuille "clients"
    console.log('🟦 [ClientsService] Appel GoogleSheetsService.getRows("clients")...');
    const rows = await GoogleSheetsService.getRows('clients');

    // 2) Log du nombre de lignes trouvées
    console.log(`🟦 [ClientsService] Nombre de lignes reçues pour "clients": ${rows.length}`);
   // console.log('🟦 [ClientsService] Contenu brut des rows:', rows);

    // 3) On mappe chaque ligne vers un objet "client"
    this.clients = rows.map((row, index) => {
      
      //console.log(`🟦 [ClientsService] Mapping row #${index + 1}`, row);


      // On récupère ici les colonnes existantes dans "clients"
      // On ignore AB1, AB2... car elles n'existent pas ici.
      return {
        id: row.ID,                // ex: "C00013"
        name: row.Nom_Client,      // ex: "Boulangerie Aziz (Mileha)"
        zone: row.zone,            // ex: "Mileha"
        actif: row.Actif,          // ex: "o"
        modeComptable: row.Mode_comptable, // ex: "CASH"
        cycle: row.CYCLE,          // ex: "1", "30"...
        defaultFormat: row.DEFAULT || '1'   // ex: "1", "5", "25", etc.
        // Vous pouvez rajouter d'autres colonnes si vous le souhaitez
      };
    });

    // 4) On affiche le résultat final
    //console.log('🟦 [ClientsService] ✅ Clients initialisés:', this.clients);
  } catch (error) {
    console.error('❌ [ClientsService] Erreur lors de l\'initialisation des clients:', error);
    throw error;
  }
}

  /**
   * Pour chaque ligne de la feuille "clients", on crée des entrées
   * dans AbbreviationsService.clientsMap.
   * - Les clés sont toutes les abréviations potentielles (AB1, AB2, Name_Client),
   *   passées en minuscule, sans espace superflu.
   * - La valeur est un objet { clientId, name, defaultFormat }.
   */
  registerAbbreviations(rows) {
    // On importe le AbbreviationsService ici
    const AbbreviationsService = require('./AbbreviationsService');

    console.log('🟦 [ClientsService] → registerAbbreviations: Début...');

    rows.forEach((row, index) => {
      // 1. Extraire le name, ab1, ab2, defaultFormat
      const rawName = row.Name_Client || '';
      const ab1 = row.AB1 || '';
      const ab2 = row.AB2 || '';
      const defaultFmt = row.DEFAULT || '1';

      // 2. Construire un petit tableau d'abréviations potentielles
      // On y met le name du client également, en plus de AB1 et AB2
      const possibleAbrevs = [rawName, ab1, ab2];

      // 3. Pour chaque abréviation non vide, on enregistre dans la Map
      possibleAbrevs.forEach((abr) => {
        if (!abr.trim()) return; // si c'est vide, on skip

        // Normalisation en minuscule
        const key = abr.toLowerCase().trim();

        // On construit la valeur à stocker
        const clientData = {
          clientId: rawName,         // On n'a pas d'ID distinct, donc on prend le "Name_Client" comme ID
          name: rawName.trim(),
          defaultFormat: defaultFmt
        };

        // On enregistre dans la map
        AbbreviationsService.clientsMap.set(key, clientData);

        // On log pour debug
        //console.log(`   🟦 [ClientsService] Ajout abréviation "${key}" ->`, clientData);
      });
    });

    console.log('🟦 [ClientsService] → registerAbbreviations: Fin.');
  }

  getClientByAbbreviation(abbreviation) {
    return this.clients.find(client => client.abbreviation === abbreviation);
  }
}

module.exports = new ClientsService();