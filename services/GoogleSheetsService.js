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

  async getRows(sheetName) {
    await this.init(); // Ensure initialization
    console.log(`📄 Récupération des lignes de la feuille "${sheetName}"...`);
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`, // Use a valid range (e.g., all columns from A to Z)
      });
      console.log('📄 Réponse de l\'API Google Sheets:', response.data); // Log the API response
      return response.data.values || [];
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des lignes de la feuille "${sheetName}":`, error);
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