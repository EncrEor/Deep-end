const GoogleSheetsService = require('../services/GoogleSheetsService');

class ClientsService {
  constructor() {
    this.clients = [];
  }

  async initialize() {
    const rows = await GoogleSheetsService.getRows('clients');
    this.clients = rows.map(row => ({
      name: row.Name_Client,
      abbreviation: row.AB1 || row.AB2,
      defaultFormat: row.DEFAULT || '1'
    }));
  }

  getClientByAbbreviation(abbreviation) {
    return this.clients.find(client => client.abbreviation === abbreviation);
  }
}

module.exports = new ClientsService();