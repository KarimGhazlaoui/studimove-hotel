const express = require('express');
const router = express.Router();

// Contrôleurs temporaires pour les hôtels
router.get('/', async (req, res) => {
  try {
    // Temporairement, nous allons retourner vos deux hôtels hardcodés
    const hotels = [
      {
        _id: '683f09f5356abd8300abd72a',
        name: "AR Bolero",
        description: "Chambres de 4 personnes max",
        address: "AR Bolero Frances Cambo - 15-17 Lloret de Mar, 17310",
        location: "Lloret De Mar",
        country: "Espagne",
        category: "Resort",
        email: "info@apartreception.com",
        phone: "+34 671 69 87 07",
        rating: 3.2,
        website: "https://www.apartreception.com/fr/ar-bolero/"
      },
      {
        _id: '683f0af5af3e2acf9dcc5d28',
        name: "Apartaments Condado",
        description: "Chambres jusqu'à 8 personnes",
        address: "Carrer Nicolau Font i Maig, 2, 17310 Lloret de Mar, Girona, Espagne",
        location: "Lloret De Mar",
        country: "Espagne",
        category: "Resort",
        email: "condado@marsolhotels.com",
        phone: "+34 972 36 75 90",
        rating: 3.5,
        website: "https://www.marsolhotels.com/fr/"
      }
    ];

    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

router.get('/:id', (req, res) => {
  // Logique temporaire pour un hôtel spécifique
  res.status(200).json({ message: `Obtenir l'hôtel avec l'ID ${req.params.id}` });
});

router.post('/', (req, res) => {
  // Logique temporaire pour créer un hôtel
  res.status(201).json({ message: 'Hôtel créé' });
});

router.put('/:id', (req, res) => {
  // Logique temporaire pour mettre à jour un hôtel
  res.status(200).json({ message: `Mettre à jour l'hôtel avec l'ID ${req.params.id}` });
});

router.delete('/:id', (req, res) => {
  // Logique temporaire pour supprimer un hôtel
  res.status(200).json({ message: `Supprimer l'hôtel avec l'ID ${req.params.id}` });
});

module.exports = router;