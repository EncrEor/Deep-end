const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const BusinessLogic = require('./core/BusinessLogic');

// Load environment variables
dotenv.config();

// Debugging line
console.log('GOOGLE_SERVICE_ACCOUNT_FILE:', process.env.GOOGLE_SERVICE_ACCOUNT_FILE);

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize BusinessLogic
const initializeApp = async () => {
  const businessLogic = new BusinessLogic();
  await businessLogic.initializeServices(); // Ensure all services are initialized
  return businessLogic;
};

// Start the server after initializing BusinessLogic
initializeApp().then((businessLogic) => {
  // API endpoint for processing messages
  app.post('/api/chat', async (req, res) => {
    console.log('📥 Requête reçue:', req.body); // Log the received request
    const { message, userId } = req.body;

    try {
      // Process the message using BusinessLogic
      const result = await businessLogic.processMessage(message, userId);
      console.log('✅ Réponse envoyée:', result); // Log the response
      res.status(200).json({ data: result });
    } catch (error) {
      console.error('❌ Erreur lors du traitement de la requête:', error); // Log the error
      res.status(500).json({ error: error.message });
    }
  });

  // Start the server
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
}).catch((error) => {
  console.error('❌ Erreur lors de l\'initialisation de l\'application:', error);
});