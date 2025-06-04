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
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Défini' : '❌ NON DÉFINI');

// Vérification
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

// Configuration CORS permissive pour les tests
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://studimove-hotel.vercel.app',
    'https://studimove-frontend.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Créer le dossier uploads s'il n'existe pas
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Routes API
app.use('/api/hotels', require('./routes/hotels'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/events', require('./routes/events'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/health', require('./routes/health'));


// Page d'accueil de l'API
app.get('/', (req, res) => {
  res.json({
    message: '🚀 StudiMove Hotel API',
    version: '1.0.0',
    status: 'Active',
    endpoints: {
      auth: '/api/auth (POST /login, /register)',
      hotels: '/api/hotels (GET, POST, PUT, DELETE)',
      users: '/api/users (GET, PUT, DELETE)',
      clients: '/api/clients (GET, POST, PUT, DELETE)',
      health: '/api/health'
    },
    documentation: 'API REST pour la gestion d\'hôtels',
    frontend: 'Déployé séparément sur Vercel'
  });
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: 'MongoDB Atlas connected'
  });
});

// Route de test pour vérifier l'authentification
app.get('/api/test', (req, res) => {
  res.json({
    message: '🧪 Test endpoint',
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
    requestedRoute: req.originalUrl,
    availableRoutes: [
      '/api/auth',
      '/api/hotels', 
      '/api/users',
      '/api/clients',
      '/api/health'
    ]
  });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('❌ Erreur serveur:', error);
  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur API démarré sur le port ${PORT}`);
  console.log(`🌐 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API disponible sur: http://localhost:${PORT}`);
  console.log(`🔍 Santé API: http://localhost:${PORT}/api/health`);
});

// Gestion gracieuse de l'arrêt
process.on('SIGTERM', () => {
  console.log('👋 Arrêt gracieux du serveur...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 Arrêt du serveur (Ctrl+C)...');
  process.exit(0);
});
