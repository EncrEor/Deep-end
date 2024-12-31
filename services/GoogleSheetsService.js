const { GoogleSpreadsheet } = require('google-spreadsheet');
const dotenv = require('dotenv');

dotenv.config();

class GoogleSheetsService {
  constructor() {
    console.log('Initialisation de GoogleSheetsService...'); // Log d'initialisation
    this.doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID);
  }

  async init() {
    console.log('🔗 Connexion à Google Sheets...'); // Log de connexion
    await this.doc.useApiKey(process.env.GOOGLE_SHEETS_API_KEY);
    await this.doc.loadInfo();
    console.log('✅ Connecté à Google Sheets'); // Log de succès
  }

  async getSheet(sheetName) {
    console.log(`🔍 Récupération de la feuille "${sheetName}"...`); // Log de récupération
    return this.doc.sheetsByTitle[sheetName];
  }

  async getRows(sheetName) {
    console.log(`📄 Récupération des lignes de la feuille "${sheetName}"...`); // Log de récupération
    const sheet = await this.getSheet(sheetName);
    return await sheet.getRows();
  }

  async addRow(sheetName, data) {
    console.log(`📝 Ajout d'une ligne dans la feuille "${sheetName}":`, data); // Log d'ajout
    const sheet = await this.getSheet(sheetName);
    await sheet.addRow(data);
    console.log('✅ Ligne ajoutée avec succès'); // Log de succès
  }
}

module.exports = new GoogleSheetsService();