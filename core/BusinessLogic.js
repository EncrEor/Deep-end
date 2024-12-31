const EventBus = require('./EventBus');
const StateManager = require('./StateManager');
const GoogleSheetsService = require('../services/GoogleSheetsService');
const DeepSeekService = require('./DeepSeekService'); // Importation correcte

console.log('DeepSeekService importé:', DeepSeekService); // Log pour vérifier l'importation

class BusinessLogic {
  constructor() {
    console.log('Initialisation de BusinessLogic...'); // Log d'initialisation
    console.log('DeepSeekService:', DeepSeekService); // Ajoute ce log
    this.deepSeekService = new DeepSeekService(); // Utilisation correcte
    console.log('DeepSeekService instancié:', this.deepSeekService); // Log de l'instanciation
    this.state = StateManager;
  }
  
  async initializeServices() {
    console.log('🔧 Initialisation des services...');
    await GoogleSheetsService.init(); // Ensure GoogleSheetsService is initialized
    console.log('✅ Services initialisés');
  }

  // Méthode pour vérifier les champs requis
  checkRequiredFields(analysis) {
    console.log('🔍 Vérification des champs requis dans l\'analyse:', analysis); // Log pour déboguer
    const requiredFields = ['type', 'client', 'produits', 'quantites'];
    const isValid = requiredFields.every(field => analysis[field] !== undefined && analysis[field] !== null);
    console.log('✅ Résultat de la vérification des champs requis:', isValid); // Log du résultat
    return isValid;
  }

  // Méthode pour valider le stock
  validateStock(products) {
    console.log('🔍 Validation du stock pour les produits:', products); // Log pour déboguer
    // Exemple de logique de validation du stock
    // Ici, on suppose que le stock est toujours suffisant
    const isValid = true; // À remplacer par une logique réelle
    console.log('✅ Résultat de la validation du stock:', isValid); // Log du résultat
    return isValid;
  }

  // Méthode pour valider le client
  validateClient(client) {
    console.log('🔍 Validation du client:', client); // Log pour déboguer
    // Exemple de logique de validation du client
    // Ici, on suppose que le client est toujours valide
    const isValid = true; // À remplacer par une logique réelle
    console.log('✅ Résultat de la validation du client:', isValid); // Log du résultat
    return isValid;
  }

  // Méthode pour gérer les erreurs de validation
  handleValidationError(analysis) {
    console.error('❌ Erreur de validation:', analysis); // Log en cas d'erreur
    throw new Error('Erreur de validation');
  }

  async processMessage(message, userId) {
    console.log('🔄 Début du traitement du message:', message); // Log du message reçu
    console.log('🆔 User ID:', userId); // Log de l'ID utilisateur

    try {
      // 1. Analyse du message via DeepSeek
      console.log('🔍 Analyse du message via DeepSeekService...');
      const analysis = await this.deepSeekService.processMessage(message, this.state.getState());
      console.log('✅ Analyse réussie:', analysis); // Log du résultat de l'analyse

      // 2. Validation métier
      console.log('🔍 Validation métier...');
      if (!this.validateDeliveryRequest(analysis)) {
        console.log('❌ Validation métier échouée'); // Log en cas d'échec de validation
        return this.handleValidationError(analysis);
      }
      console.log('✅ Validation métier réussie'); // Log en cas de succès de validation

      // 3. Exécution
      console.log('🚀 Exécution de la livraison...');
      const result = await this.executeDelivery(analysis);
      console.log('✅ Livraison exécutée:', result); // Log du résultat de la livraison

      // 4. Mise à jour état
      console.log('🔄 Mise à jour de l\'état...');
      this.state.updateState({
        currentDelivery: result.delivery,
        currentClient: result.client
      });
      console.log('✅ État mis à jour:', this.state.getState()); // Log de l'état mis à jour

      return result;
    } catch (error) {
      console.error('❌ Erreur lors du traitement du message:', error); // Log en cas d'erreur
      throw error;
    }
  }

  validateDeliveryRequest(analysis) {
    console.log('🔍 Validation des champs requis...');
    const isValid = this.checkRequiredFields(analysis) && 
                    this.validateStock(analysis.products) &&
                    this.validateClient(analysis.client);
    console.log('✅ Résultat de la validation:', isValid); // Log du résultat de la validation
    return isValid;
  }

  async executeDelivery(analysis) {
    console.log('📝 Mise à jour de Google Sheets...');
    try {
      // Assuming analysis.products is an array of products with their quantities
      for (const product of analysis.products) {
        await GoogleSheetsService.addRow('livraisons', {
          ID_Livraison: analysis.deliveryId,
          Date_Livraison: new Date().toISOString(),
          ID_Client: analysis.clientId,
          Produit: product.name,
          Quantite: product.quantity,
          Statut_L: 'Livrée'
        });
      }
      console.log('✅ Google Sheets mis à jour avec succès'); // Log en cas de succès
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de Google Sheets:', error); // Log en cas d'erreur
      throw error;
    }

    return {
      delivery: analysis.deliveryId,
      client: analysis.clientId
    };
  }
}

module.exports = BusinessLogic; // Exporte la classe elle-même