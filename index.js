const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const BusinessLogic = require('./core/BusinessLogic');
const businessLogic = new BusinessLogic(); // Crée une instance de BusinessLogic

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  console.log('📥 Requête reçue:', req.body); // Log de la requête reçue
  const { message, userId } = req.body;

  try {
    const result = await businessLogic.processMessage(message, userId); // Utilise l'instance de BusinessLogic
    console.log('✅ Réponse envoyée:', result); // Log de la réponse envoyée
    res.status(200).json({ data: result });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête:', error); // Log en cas d'erreur
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});