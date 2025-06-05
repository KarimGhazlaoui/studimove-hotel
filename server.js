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

// 🔧 Routes API - Organisées par ordre de priorité
try {
  // Routes principales
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/events', require('./routes/events'));
  app.use('/api/hotels', require('./routes/hotels'));
  app.use('/api/clients', require('./routes/clients'));
  
  // Routes d'assignation - Une seule route pour éviter les conflits
  app.use('/api/assignments', require('./routes/assignments'));
  
  // Routes utilitaires
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/health', require('./routes/health'));
  
  console.log('✅ Toutes les routes API chargées avec succès');
} catch (error) {
  console.error('❌ Erreur lors du chargement des routes:', error.message);
  console.log('⚠️ Certaines routes peuvent ne pas être disponibles');
}

// 🚫 DÉSACTIVÉ : Servir les fichiers statiques (frontend séparé)
// if (process.env.NODE_ENV === 'production') {
//   app.use(express.static('client/build'));
//   
//   app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
//   });
// }

// Page d'accueil de l'API
app.get('/', (req, res) => {
  res.json({
    message: '🚀 StudiMove Hotel API',
    version: '2.0.0',
    status: 'Active',
    timestamp: new Date().toISOString(),
    deployment: 'Backend API Only (Frontend séparé)',
    endpoints: {
      auth: '/api/auth (POST /login, /register)',
      users: '/api/users (GET, PUT, DELETE)',
      events: '/api/events (GET, POST, PUT, DELETE)',
      hotels: '/api/hotels (GET, POST, PUT, DELETE)',
      clients: '/api/clients (GET, POST, PUT, DELETE)',
      assignments: '/api/assignments (GET, POST, PUT, DELETE)',
      dashboard: '/api/dashboard (GET)',
      health: '/api/health (GET)'
    },
    documentation: 'API REST pour la gestion d\'hôtels et événements',
    frontend: {
      url: 'https://studimove-frontend.vercel.app',
      status: 'Déployé séparément sur Vercel'
    },
    features: [
      'Gestion des événements multi-pays',
      'Système d\'assignation intelligent',
      'Import CSV avec validation',
      'Statistiques en temps réel',
      'Authentification JWT',
      'Upload de fichiers'
    ]
  });
});

// Route de santé détaillée
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: '✅ API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: 'MongoDB Atlas connected',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.0',
    deployment: 'Render (Backend Only)',
    routes: {
      auth: '✅ Active',
      users: '✅ Active', 
      events: '✅ Active',
      hotels: '✅ Active',
      clients: '✅ Active',
      assignments: '✅ Active',
      dashboard: '✅ Active'
    }
  };

  res.json(healthStatus);
});

// Route de test pour vérifier l'authentification
app.get('/api/test', (req, res) => {
  res.json({
    message: '🧪 Test endpoint',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    method: req.method,
    url: req.url,
    ip: req.ip
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  console.log(`❌ Route non trouvée: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    message: 'Route API non trouvée',
    requestedRoute: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    note: 'Ceci est un backend API uniquement. Le frontend est déployé séparément.',
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/events',
      'GET /api/hotels',
      'GET /api/clients',
      'GET /api/assignments/event/:eventId',
      'GET /api/dashboard',
      'GET /api/users/profile'
    ],
    documentation: 'Consultez GET / pour la liste complète des endpoints'
  });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('❌ Erreur serveur:', error);
  
  // Log détaillé en développement
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack trace:', error.stack);
    console.error('Request:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    timestamp: new Date().toISOString(),
    error: process.env.NODE_ENV === 'development' ? {
      message: error.message,
      stack: error.stack
    } : 'Internal server error',
    requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('\n🎉 ================================');
  console.log('🚀 StudiMove API Server Started');
  console.log('🎉 ================================');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: Backend API uniquement`);
  console.log(`🏥 Health: /api/health`);
  console.log(`📚 Docs: /`);
  console.log(`🖥️ Frontend: Déployé séparément`);
  console.log('🎉 ================================\n');
});

// Gestion gracieuse de l'arrêt
const gracefulShutdown = (signal) => {
  console.log(`\n👋 Arrêt gracieux du serveur (${signal})...`);
  
  server.close(() => {
    console.log('✅ Serveur HTTP fermé');
    process.exit(0);
  });
  
  // Forcer l'arrêt après 10 secondes
  setTimeout(() => {
    console.error('❌ Arrêt forcé du serveur');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

module.exports = app;
