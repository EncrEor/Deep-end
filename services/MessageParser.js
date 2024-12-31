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
    let context = 'order';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      if (this.isClientLine(line)) {
        currentClient = this.getClient(line);
        if (!currentClient) {
          // Handle unknown client
        }
        i++;
      } else if (line.toLowerCase().includes('retour')) {
        context = 'return';
        const parts = line.split(' ');
        if (parts.length > 1) {
          currentClient = this.getClient(parts.slice(1).join(' '));
        }
        i++;
      } else {
        const quantities = line.split(' ').map(Number);
        if (quantities.every(q => !isNaN(q))) {
          // Handle quantity lines based on context and default format
        } else {
          // Handle product abbreviation lines
        }
        i++;
      }
    }

    return orders;
  }

  isClientLine(line) {
    // Logic to determine if line is a client name or abbreviation
  }

  getClient(line) {
    // Logic to find client based on line
  }
}

module.exports = new MessageParser();