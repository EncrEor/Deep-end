const MessageParser = require('../services/MessageParser');
const ClientsService = require('../services/ClientsService');
const ProductsService = require('../services/ProductsService');

class DeepSeekService {
  constructor() {
    console.log('Initialisation de DeepSeekService...');
    this.messageParser = MessageParser;
    this.clientsService = ClientsService;
    this.productsService = ProductsService;
  }

  async processMessage(message, context = {}) {
    console.log('🔍 Traitement du message via DeepSeek:', message);
    try {
        // Garder l'initialisation
        if (!this.clientsService.clients?.length) {
            await this.clientsService.initialize();
        }
        if (!this.productsService.products?.length) {
            await this.productsService.initialize();
        }

        const parsedData = await this.messageParser.parseMessage(message);
        if (parsedData?.length > 0) {
            // Enrichir chaque ordre de livraison
            return parsedData.map(order => ({
                ...order,
                type: 'delivery',
                deliveryId: this.generateDeliveryId()
            }));
        }
        return this.handleGeneralMessage(message);
    } catch (error) {
        console.error('❌ Erreur traitement:', error);
        throw error;
    }
}
  
  enrichParsedData(parsedData) {
    const enrichedData = {
      type: parsedData.type || 'general',
      client: null,
      produits: [],
      quantites: [],
      deliveryId: parsedData.deliveryId || this.generateDeliveryId(),
      total: 0
    };
  
    if (parsedData.client) {
      enrichedData.client = parsedData.client.name;
      enrichedData.clientId = parsedData.client.id;
    }
  
    if (parsedData.products && parsedData.products.length) {
      for (const product of parsedData.products) {
        const productDetails = this.productsService.getProductByAbbreviation(product.name);
        if (productDetails) {
          enrichedData.produits.push(productDetails.name);
          enrichedData.quantites.push(product.quantity);
          enrichedData.total += productDetails.price * product.quantity;
        }
      }
    }
  
    return enrichedData;
  }

  handleClientContext(data) {
    console.log('🔍 Contexte client détecté:', data);
    if (data.type === 'delivery') {
      return `Livraison créée pour le client ${data.client}. Produits: ${data.produits.join(', ')}. Total: ${data.total} €.`;
    } else {
      return `Informations sur le client ${data.client}: ${JSON.stringify(data)}`;
    }
  }

  handleGeneralMessage(message) {
    console.log('🔍 Message général détecté:', message);
    // Provide a meaningful response without throwing an error
    return `Message reçu: "${message}". Veuillez fournir des détails de livraison si nécessaire.`;
  }

  generateDeliveryId() {
    return `DLV-${Date.now()}`;
  }
}

module.exports = DeepSeekService; // Export the class itself