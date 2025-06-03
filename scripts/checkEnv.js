const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

console.log('=== Vérification des variables d\'environnement ===');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Défini' : 'NON DÉFINI');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Défini' : 'NON DÉFINI');
console.log('PORT:', process.env.PORT || 'Utilise 5000 par défaut');
console.log('NODE_ENV:', process.env.NODE_ENV || 'Utilise development par défaut');

if (!process.env.MONGODB_URI) {
  console.error('\n❌ ERREUR: MONGODB_URI n\'est pas défini dans le fichier .env');
  console.log('Créez un fichier .env à la racine du projet avec:');
  console.log('MONGODB_URI=votre_uri_mongodb');
  console.log('JWT_SECRET=votre_secret_jwt');
}

if (!process.env.JWT_SECRET) {
  console.error('\n❌ ERREUR: JWT_SECRET n\'est pas défini dans le fichier .env');
}