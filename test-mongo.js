require('dotenv').config();
const mongoose = require('mongoose');

// Suppression de l'avertissement strictQuery
mongoose.set('strictQuery', false);

console.log('URI MongoDB (masqué):', process.env.MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connexion MongoDB réussie!');
  process.exit(0);
})
.catch(err => {
  console.error('Erreur de connexion MongoDB:', err.message);
  
  if (err.name === 'MongoServerError' && err.code === 8000) {
    console.log('\nConseil: Cette erreur indique généralement un problème d\'authentification.');
    console.log('1. Vérifiez que le nom d\'utilisateur et le mot de passe sont corrects');
    console.log('2. Assurez-vous que l\'utilisateur a les permissions nécessaires');
    console.log('3. Vérifiez que l\'utilisateur est associé au bon cluster');
  }
  
  process.exit(1);
});