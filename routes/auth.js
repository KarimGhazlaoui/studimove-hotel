const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Tentative de connexion pour:', req.body.email);
    
    const { email, password } = req.body;
    
    // Vérifier si l'utilisateur existe
    console.log('🔍 Recherche utilisateur...');
    const user = await User.findOne({ email });
    console.log('👤 Utilisateur trouvé:', user ? 'OUI' : 'NON');
    
    if (!user || !user.isActive) {
      console.log('❌ Utilisateur non trouvé ou inactif');
      return res.status(400).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }
    
    // Vérifier le mot de passe
    console.log('🔒 Vérification mot de passe...');
    const isMatch = await user.comparePassword(password);
    console.log('🔑 Mot de passe correct:', isMatch ? 'OUI' : 'NON');
    
    if (!isMatch) {
      console.log('❌ Mot de passe incorrect');
      return res.status(400).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }
    
    // Créer le token JWT
    console.log('🎫 Création du token JWT...');
    console.log('JWT_SECRET disponible:', process.env.JWT_SECRET ? 'OUI' : 'NON');
    
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ Token créé avec succès');
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('💥 ERREUR DE CONNEXION:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }

    // Créer l'utilisateur
    const user = await User.create({
      name,
      email,
      password
    });

    // Créer le token JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erreur d\'inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
