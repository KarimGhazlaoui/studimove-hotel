const mongoose = require('mongoose');
require('dotenv').config();

// Importer le modèle User
const User = require('../server/models/User');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const createDefaultUser = async () => {
  try {
    // Vérifier si l'utilisateur existe déjà
    const userExists = await User.findOne({ email: 'admin@studimove.com' });
    
    if (userExists) {
      console.log('L\'utilisateur admin existe déjà');
      mongoose.connection.close();
      return;
    }
    
    // Créer l'utilisateur admin
    const admin = await User.create({
      name: 'Admin StudiMove',
      email: 'admin@studimove.com',
      password: 'password123',
      role: 'admin'
    });
    
    console.log('Utilisateur admin créé avec succès:', admin.name);
    mongoose.connection.close();
  } catch (err) {
    console.error('Erreur lors de la création de l\'admin:', err);
    mongoose.connection.close();
  }
};

createDefaultUser();
