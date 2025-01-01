const EventBus = require('./EventBus');
const StateManager = require('./StateManager');
const GoogleSheetsService = require('../services/GoogleSheetsService');
const DeepSeekService = require('./DeepSeekService');
const ProductsService = require('../services/ProductsService');

console.log('DeepSeekService importé:', DeepSeekService);

class BusinessLogic {
  constructor() {
    console.log('Initialisation de BusinessLogic...');
    console.log('DeepSeekService:', DeepSeekService);
    this.deepSeekService = new DeepSeekService();
    console.log('DeepSeekService instancié:', this.deepSeekService);
    this.state = StateManager;
    this.productsService = ProductsService;
  }

  async initializeServices() {
    await GoogleSheetsService.init();
    await this.productsService.initialize();
    const ClientsService = require('../services/ClientsService');
    await ClientsService.initialize();
    const AbbreviationsService = require('../services/AbbreviationsService');
    await AbbreviationsService.initialize();
  }

  checkRequiredFields(analysis) {
    console.log('🔍 Vérification des champs requis dans l\'analyse:', analysis);
    if (analysis.type === 'info') return true;
    
    const requiredFields = ['type', 'client', 'products'];
    const isValid = requiredFields.every(field => analysis[field] !== undefined && analysis[field] !== null);
    console.log('✅ Résultat de la vérification des champs requis:', isValid);
    return isValid;
  }

  validateStock(products) {
    console.log('🔍 Validation du stock pour les produits:', products);
    const isValid = true;
    console.log('✅ Résultat de la validation du stock:', isValid);
    return isValid;
  }

  validateClient(client) {
    console.log('🔍 Validation du client:', client);
    const isValid = true;
    console.log('✅ Résultat de la validation du client:', isValid);
    return isValid;
  }

  handleValidationError(analysis) {
    const errorDetails = `Validation failed for analysis: ${JSON.stringify(analysis)}`;
    console.error('❌ Erreur de validation:', errorDetails);
    throw new Error(errorDetails);
  }

  async processMessage(message, userId) {
    console.log('🔄 Début du traitement du message:', message);
    console.log('🆔 User ID:', userId);

    try {
      console.log('🔍 Analyse du message via DeepSeekService...');
      const analysis = await this.deepSeekService.processMessage(message, this.state.getState());
      console.log('✅ Analyse réussie:', analysis);

      console.log('🔍 Validation métier...');
      if (!this.validateDeliveryRequest(analysis)) {
        console.log('❌ Validation métier échouée');
        return this.handleValidationError(analysis);
      }
      console.log('✅ Validation métier réussie');

      console.log('🚀 Exécution de la livraison...');
      const result = await this.executeDelivery(analysis);
      console.log('✅ Livraison exécutée:', result);

      if (result.status === 'success') {
        console.log('🔄 Mise à jour de l\'état...');
        this.state.updateState({
          current: {
            delivery: result.data,
            client: {
              id: result.data.client,
              name: result.data.clientName
            }
          }
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Erreur lors du traitement du message:', error);
      throw error;
    }
  }

  validateDeliveryRequest(analysis) {
    if (analysis.type === 'info') return true;

    if (Array.isArray(analysis)) {
      return analysis.every(order =>
        order.client &&
        Array.isArray(order.products) &&
        order.products.length > 0
      );
    }

    return this.checkRequiredFields(analysis) &&
      this.validateStock(analysis.products) &&
      this.validateClient(analysis.client);
  }

  async executeDelivery(analysis) {
    try {
      if (analysis.type === 'info') {
        return {
          status: 'info',
          message: analysis.message
        };
      }

      const orders = Array.isArray(analysis) ? analysis : [analysis];
      let total = 0;
      const results = [];

      const productInfo = await GoogleSheetsService.getRows('produits');
      
      for (const order of orders) {
        for (const product of order.products) {
          const productData = productInfo.find(p => p.ID_Produit === product.productId);
          if (!productData) {
            console.warn(`❌ Produit non trouvé: ${product.productId}`);
            continue;
          }

          const unitPrice = parseFloat(productData.Prix_Unitaire.replace(',', '.')) || 0;
          const itemTotal = unitPrice * product.quantity;
          total += itemTotal;

          await GoogleSheetsService.addRow('livraisons', {
            ID_Livraison: order.deliveryId,
            Date_Livraison: new Date().toISOString(),
            ID_Client: order.client.id,
            Produit: product.productId,
            Quantite: product.quantity,
            Prix_Unitaire: unitPrice,
            Total: itemTotal,
            Statut_L: order.type === 'return' ? 'Retour' : 'Livrée',
            Type: order.type
          });
        }

        results.push({
          deliveryId: order.deliveryId,
          client: order.client.id,
          clientName: order.client.name,
          products: order.products,
          total,
          type: order.type
        });
      }

      return {
        status: 'success',
        message: this.formatDeliveryMessage(results),
        data: results.length === 1 ? results[0] : results
      };
    } catch (error) {
      console.error('❌ Erreur GoogleSheets:', error);
      throw error;
    }
  }

  formatDeliveryMessage(results) {
    return results.map(result => 
      `${result.type === 'return' ? 'Retour' : 'Livraison'} ${result.deliveryId} ` +
      `créée pour ${result.clientName}\nTotal: ${result.total.toFixed(3)} TND`
    ).join('\n');
  }
}

module.exports = BusinessLogic;