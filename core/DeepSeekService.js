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
      // Initialize clients and products data if not already done
      if (!this.clientsService.clients.length) {
        await this.clientsService.initialize();
      }
      if (!this.productsService.products.length) {
        await this.productsService.initialize();
      }

      // Parse the message using MessageParser
      const parsedData = await this.messageParser.parseMessage(message);
      console.log('✅ Réponse de DeepSeek:', parsedData);

      // Enrich parsed data with client and product details
      const enrichedData = this.enrichParsedData(parsedData);

      // Respond based on the context
      if (enrichedData.client) {
        return this.handleClientContext(enrichedData);
      } else {
        return this.handleGeneralMessage(message);
      }
    } catch (error) {
      console.error('❌ Erreur lors du traitement du message:', error);
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

    // Enrich client information
    if (parsedData.client) {
      const client = this.clientsService.getClientByAbbreviation(parsedData.client);
      if (client) {
        enrichedData.client = client.name;
        enrichedData.clientId = client.id;
      }
    }

    // Enrich product information
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
    return `Je ne reconnais pas de contexte de livraison. Pouvez-vous fournir plus de détails ? Message reçu: "${message}"`;
  }

  generateDeliveryId() {
    return `DLV-${Date.now()}`;
  }
}

module.exports = DeepSeekService; // Export the class itself