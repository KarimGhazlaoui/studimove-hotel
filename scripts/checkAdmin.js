const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');

// Configurer mongoose pour éviter les warnings
mongoose.set('strictQuery', false);

dotenv.config();

const checkAdmin = async () => {
  try {
    // Vérifier que MONGODB_URI existe
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI n\'est pas défini dans le fichier .env');
      return;
    }

    console.log('Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    const admin = await User.findOne({ email: 'admin@studimove.com' });
    
    if (admin) {
      console.log('✅ Admin trouvé:', {
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt
      });
    } else {
      console.log('❌ Aucun admin trouvé avec cet email');
    }
    
    // Compter tous les utilisateurs
    const userCount = await User.countDocuments();
    console.log(`📊 Total utilisateurs: ${userCount}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    mongoose.disconnect();
  }
};

checkAdmin();
