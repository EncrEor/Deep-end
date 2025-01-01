const ClientsService = require('./ClientsService');
const ProductsService = require('./ProductsService');

class MessageParser {
  constructor() {
    this.clientsService = ClientsService;
    this.productsService = ProductsService;
  }

  async parseMessage(message) {
    const lines = message.split('\n');
    const orders = [];
    let currentClient = null;
  
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
  
      if (this.isClientLine(trimmedLine)) {
        currentClient = this.getClient(trimmedLine);
        continue;
      }
  
      // Assume the rest are product quantities
      const quantities = trimmedLine.split(' ').map(Number);
      if (quantities.every(q => !isNaN(q)) && currentClient) {
        // Map quantities to products based on default format or other rules
        // Example: assuming the first quantity is for 'citron 1L', etc.
        const products = [];
        quantities.forEach((qty, index) => {
          const product = this.productsService.products.find(p => p.defaultPosition === index + 1);
          if (product && qty > 0) {
            products.push({ product, quantity: qty });
          }
        });
        orders.push({ client: currentClient, products });
      }
    }
  
    return orders;
  }

  isClientLine(line) {
    if (!line || typeof line !== 'string') {
      return false; // Return false if the line is not a valid string
    }

    // Ensure clientsService.clients is initialized and not empty
    if (!this.clientsService.clients || this.clientsService.clients.length === 0) {
      return false; // Return false if there are no clients
    }

    // Check if the line matches any client name or abbreviation
    return this.clientsService.clients.some(client => {
      if (!client || !client.name || !client.abbreviation) {
        return false; // Skip invalid client entries
      }
      return client.abbreviation === line || client.name.toLowerCase() === line.toLowerCase();
    });
  }

  getClient(line) {
    return this.clientsService.clients.find(client => client.abbreviation === line || client.name.toLowerCase() === line.toLowerCase());
  }

}

module.exports = new MessageParser();