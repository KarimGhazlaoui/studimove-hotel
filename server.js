// Importation des modules
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');

// Chargement des variables d'environnement
dotenv.config();

// Debug
console.log('🔧 Variables d\'environnement:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Défini' : '❌ NON DÉFINI');

// Vérifications
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI manquant');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET manquant');
  process.exit(1);
}

// Connexion DB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes API
app.use('/api/hotels', require('./routes/hotels'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));

// En production, servir les fichiers build
if (process.env.NODE_ENV === 'production') {
  // Servir les fichiers statiques React
  app.use(express.static(path.join(__dirname, 'build')));
  
  // Pour toutes les routes non-API, servir index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ 
      message: '🚀 StudiMove Hotel API',
      endpoints: ['/api/auth', '/api/hotels', '/api/users']
    });
  });
}

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: '✅ OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV 
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 Mode: ${process.env.NODE_ENV || 'development'}`);
});
