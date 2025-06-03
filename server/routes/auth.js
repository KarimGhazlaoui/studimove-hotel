const express = require('express');
const router = express.Router();

// À ce stade, nous définissons simplement des routes temporaires
// jusqu'à ce que nous implémentions complètement l'authentification
router.post('/register', (req, res) => {
  res.status(200).json({ message: 'Route d\'inscription temporaire' });
});

router.post('/login', (req, res) => {
  res.status(200).json({ message: 'Route de connexion temporaire' });
});

router.get('/me', (req, res) => {
  res.status(200).json({ message: 'Route de profil temporaire' });
});

module.exports = router;