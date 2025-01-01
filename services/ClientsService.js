const GoogleSheetsService = require('../services/GoogleSheetsService');

class ClientsService {
  constructor() {
    this.clients = [];
  }

  async initialize() {
    try {
      const rows = await GoogleSheetsService.getRows('clients');
      console.log('📄 Rows fetched from Google Sheets:', rows); // Log the fetched rows
      this.clients = rows.map(row => ({
        name: row.Name_Client,
        abbreviation: row.AB1 || row.AB2,
        defaultFormat: row.DEFAULT || '1'
      }));
      console.log('✅ Clients initialisés:', this.clients);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation des clients:', error);
      throw error;
    }
  }

  getClientByAbbreviation(abbreviation) {
    return this.clients.find(client => client.abbreviation === abbreviation);
  }
}

module.exports = new ClientsService();