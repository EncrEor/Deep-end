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
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
}));
app.use(express.json());

app.use((req, res, next) => {
  res.header('Connection', 'keep-alive');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'content-type');
  next();
});


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
    try {
      const result = await businessLogic.processMessage(req.body.message, req.body.userId);
      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Start the server
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
}).catch((error) => {
  console.error('❌ Erreur lors de l\'initialisation de l\'application:', error);
});