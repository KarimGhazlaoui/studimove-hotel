// Importation des modules
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');

// Chargement des variables d'environnement
dotenv.config();

// Debug - vérifier les variables d'environnement
console.log('🔧 Variables d\'environnement:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Défini' : '❌ NON DÉFINI');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Défini' : '❌ NON DÉFINI');

// Vérifier que les variables critiques sont définies
if (!process.env.MONGODB_URI) {
  console.error('❌ ERREUR: MONGODB_URI n\'est pas défini');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('❌ ERREUR: JWT_SECRET n\'est pas défini');
  process.exit(1);
}

// Connexion à la base de données
connectDB();

// Initialisation de l'application Express
const app = express();

// Configuration CORS pour la production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        process.env.FRONTEND_URL || 'https://your-frontend-url.vercel.app',
        'https://studimove-hotel.vercel.app' // Remplacez par votre vraie URL
      ]
    : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes API
app.use('/api/hotels', require('./routes/hotels'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));

// Si en production, servir les fichiers statiques du frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ 
      message: 'API StudiMove Hotel - Environnement de développement',
      endpoints: {
        auth: '/api/auth',
        hotels: '/api/hotels', 
        users: '/api/users'
      }
    });
  });
}

// Route de santé pour vérifier que l'API fonctionne
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Port du serveur
const PORT = process.env.PORT || 5000;

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📡 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});

// Gestion gracieuse de l'arrêt
process.on('SIGTERM', () => {
  console.log('👋 Arrêt gracieux du serveur...');
  process.exit(0);
});
