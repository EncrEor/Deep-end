class DeepSeekService {
    constructor() {
      console.log('Initialisation de DeepSeekService...'); // Log d'initialisation
    }
  
    async processMessage(message, context = {}) {
      console.log('🔍 Traitement du message via DeepSeek:', message); // Log du message
  
      // Logique pour interpréter le message
      const response = this.interpretMessage(message, context);
      console.log('✅ Réponse de DeepSeek:', response); // Log de la réponse
  
      return response;
    }
  
    interpretMessage(message, context) {
      // Exemple de logique pour interpréter le message
      const keywords = {
        "livrer": "delivery",
        "client": "client",
        "citron": "citron",
        "Bombay Aouina": "Bombay Aouina"
      };
  
      const extractedData = {
        type: "delivery",
        client: null,
        produits: [],
        quantites: []
      };
  
      // Extraction des informations du message
      for (const [keyword, value] of Object.entries(keywords)) {
        if (message.includes(keyword)) {
          if (value === "client") {
            extractedData.client = keyword;
          } else if (value === "citron") {
            extractedData.produits.push("citron");
            const quantityMatch = message.match(/\d+/);
            extractedData.quantites.push(quantityMatch ? parseInt(quantityMatch[0]) : 1);
          }
        }
      }
  
      return extractedData;
    }
  }
  
  module.exports = DeepSeekService; // Exportation correcte