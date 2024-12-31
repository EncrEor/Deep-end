const GoogleSheetsService = require('../services/GoogleSheetsService');

class ProductsService {
  constructor() {
    this.products = [];
  }

  async initialize() {
    const rows = await GoogleSheetsService.getRows('produits');
    this.products = rows.map(row => ({
      id: row.ID_Produit,
      name: row.Nom_Produit,
      format: row.Format,
      isFrozen: row.Surgelé || false
    }));
  }

  getProductByAbbreviation(abbreviation) {
    // Implement logic to match product abbreviations
  }
}

module.exports = new ProductsService();