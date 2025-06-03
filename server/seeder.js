const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI);

const createAdmin = async () => {
  try {
    // Supprimer les utilisateurs existants
    await User.deleteMany({ email: 'admin@studimove.com' });

    // Créer un nouvel admin
    await User.create({
      name: 'Admin StudiMove',
      email: 'admin@studimove.com',
      password: 'password123',
      role: 'admin'
    });

    console.log('Utilisateur admin créé!');
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

createAdmin();