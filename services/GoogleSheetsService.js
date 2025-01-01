const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

class GoogleSheetsService {
  constructor() {
    console.log('Initialisation de GoogleSheetsService...');
    this.auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_FILE), // Resolve the path to the service account file
      scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Scope for accessing Google Sheets
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.spreadsheetId = process.env.SPREADSHEET_ID; // ID of the Google Sheet
    this.initialized = false; // Track initialization status
  }

  async init() {
    if (!this.initialized) {
      console.log('🔗 Connexion à Google Sheets...');
      await this.auth.getClient(); // Authenticate
      console.log('✅ Connecté à Google Sheets');
      this.initialized = true;
    }
  }

  async getSheet(sheetName) {
    await this.init(); // Ensure initialization
    console.log(`🔍 Récupération de la feuille "${sheetName}"...`);
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      throw new Error(`Feuille "${sheetName}" non trouvée`);
    }
    return sheet;
  }

/**
 * Récupère toutes les lignes d'une feuille Google Sheets,
 * puis convertit chaque ligne en objet à partir de la première ligne (header).
 * @param {string} sheetName - Nom de la feuille (onglet) à récupérer
 * @returns {Array<Object>} Un tableau d'objets, chaque objet représentant une ligne
 */
async getRows(sheetName) {
  // On s'assure que l'authentification est bien faite
  await this.init();
  console.log(`📄 [GoogleSheetsService] Récupération des lignes de la feuille "${sheetName}"...`);

  try {
    // On récupère toutes les valeurs de la feuille, colonnes A à Z
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    //console.log('📄 [GoogleSheetsService] Réponse brute de l\'API Google Sheets:', response.data);

    // rows est un tableau de tableaux
    const rows = response.data.values || [];  // Si pas de valeurs, on initialise à un tableau vide

    // Si moins de 2 lignes, alors il n'y a pas de données à parser
    if (rows.length < 2) {
      console.warn(`⚠️ [GoogleSheetsService] Feuille "${sheetName}" : aucune donnée ou en-tête uniquement.`);
      return [];
    }

    // La première ligne contient les en-têtes (ex: ['ID_Client', 'Name_Client', 'AB1', 'AB2', 'DEFAULT', ...])
    const header = rows[0];

    // Les lignes suivantes contiennent les valeurs
    const dataRows = rows.slice(1);

    // On va mapper chaque ligne vers un objet {colonne: valeur}
    const mappedData = dataRows.map((rowArray, rowIndex) => {
      const rowObj = {};

      // On parcourt chaque cellule de la ligne
      rowArray.forEach((cellValue, colIndex) => {
        const colName = header[colIndex]; // nom de la colonne
        // Pour éviter un undefined si la ligne a moins de colonnes que le header
        if (colName) {
          rowObj[colName] = cellValue;
        }
      });

      // (Optionnel) log pour debug
      // console.log(`🔎 [GoogleSheetsService] Ligne ${rowIndex + 2} ->`, rowObj);

      return rowObj;
    });

    //console.log(`✅ [GoogleSheetsService] ${mappedData.length} lignes de données analysées dans "${sheetName}".`);

    // LE RETOUR QUI MANQUAIT
    return mappedData;

  } catch (error) {
    console.error(`❌ [GoogleSheetsService] Erreur lors de la récupération des lignes de "${sheetName}":`, error);
    throw error;
  }
}

  async addRow(sheetName, data) {
    await this.init(); // Ensure initialization
    console.log(`📝 Ajout d'une ligne dans la feuille "${sheetName}":`, data);
    const values = [Object.values(data)]; // Convert data object to an array of values
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: sheetName,
      valueInputOption: 'RAW',
      resource: { values },
    });
    console.log('✅ Ligne ajoutée avec succès');
  }
}

module.exports = new GoogleSheetsService();