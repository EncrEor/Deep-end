const GoogleSheetsService = require('../services/GoogleSheetsService');

class ProductsService {
  constructor() {
    this.products = [];
  }

  async initialize() {
    try {
      const rows = await GoogleSheetsService.getRows('produits');
      console.log('📄 Rows fetched from Google Sheets:', rows); // Log the fetched rows
      this.products = rows.map(row => ({
        id: row.ID_Produit,
        name: row.Nom_Produit,
        format: row.Format,
        isFrozen: row.Surgelé || false
      }));
      console.log('✅ Produits initialisés:', this.products);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation des produits:', error);
      throw error;
    }
  }
  
  getProductByAbbreviation(abbreviation) {
    // Implement logic to match product abbreviations
  }
}

module.exports = new ProductsService();