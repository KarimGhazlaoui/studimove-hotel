const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');

// Configurer mongoose pour éviter les warnings
mongoose.set('strictQuery', false);

dotenv.config();

const createAdmin = async () => {
  try {
    // Vérifier que MONGODB_URI existe
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI n\'est pas défini dans le fichier .env');
      console.log('Créez un fichier .env à la racine avec votre URI MongoDB');
      return;
    }

    console.log('Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    // Supprimer l'admin existant s'il y en a un
    const deleted = await User.deleteOne({ email: 'admin@studimove.com' });
    if (deleted.deletedCount > 0) {
      console.log('🗑️ Admin existant supprimé');
    }
    
    // Créer le nouvel admin
    const admin = await User.create({
      name: 'Administrateur',
      email: 'admin@studimove.com',
      password: 'Admin123!',
      role: 'admin',
      isActive: true
    });
    
    console.log('✅ Administrateur créé avec succès:');
    console.log('📧 Email:', admin.email);
    console.log('🔐 Mot de passe: Admin123!');
    console.log('👤 Rôle:', admin.role);
    console.log('🆔 ID:', admin._id);
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error.message);
  } finally {
    mongoose.disconnect();
  }
};

createAdmin();
