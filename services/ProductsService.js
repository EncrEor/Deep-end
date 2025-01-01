const GoogleSheetsService = require('../services/GoogleSheetsService');

class ProductsService {
  constructor() {
    this.products = [];
  }

  async initialize() {
    console.log('🟧 [ProductsService] Initialisation des produits...');
    try {
      // 1. Récupérer toutes les lignes de la feuille "produits"
      console.log('🟧 [ProductsService] Appel GoogleSheetsService.getRows("produits")...');
      const rows = await GoogleSheetsService.getRows('produits');
      
      console.log(`🟧 [ProductsService] Nombre de lignes reçues pour "produits": ${rows.length}`);
      //console.log('📄 Rows fetched from Google Sheets:', rows);
  
      // 2. On mappe chaque "row" vers un objet produit
      this.products = rows.map((row) => {
        // Récupérer l'id, le nom, etc.
        const idProduit = row.ID_Produit;
        const nomProduit = row.Nom_Produit;
        const contenance = row.Contenance;  // ex: "1", "0,25", "5", ...
        
        // Déterminer format
        // on peut stocker la contenance telle quelle, ou "1L", "25CL", "5L"
        // ex. si contenance= "1" => format="1L", si "0,25" => "25CL", si "5" => "5L", etc.
        let formatDetected = '';
        if (contenance === '1') formatDetected = '1L';
        else if (contenance === '0,25') formatDetected = '25CL';
        else if (contenance === '5') formatDetected = '5L';
        else {
          // on tente d'autres cas ex. "3" => "3L", ou on laisse contenance brute
          formatDetected = contenance + 'L';
        }
  
        // Déterminer isFrozen 
        // => si "Surgelé" apparaît dans Nom_Produit, ou si ID_Produit finit par "S"
        let frozen = false;
        const lowerName = (nomProduit || '').toLowerCase();
        if (lowerName.includes('surgelé')) {
          frozen = true;
        } else if (idProduit.endsWith('S')) {
          // ex: "F1LS"
          frozen = true;
        }
  
        return {
          id: idProduit,
          name: nomProduit,
          format: formatDetected,
          isFrozen: frozen
        };
      });
  
    
    //  console.log('✅ Produits initialisés:', this.products);
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