const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');
const auth = require('../middleware/auth'); // Import du middleware

// @route   GET /api/hotels
// @desc    Obtenir tous les hôtels (PUBLIC)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const hotels = await Hotel.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// @route   GET /api/hotels/:id
// @desc    Obtenir un hôtel par ID (PUBLIC)
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }
    
    res.json({
      success: true,
      data: hotel
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// @route   POST /api/hotels
// @desc    Créer un nouvel hôtel (PROTÉGÉ)
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, address, city, pricePerNight, rating, amenities, imageUrl, phone, email, available } = req.body;

    // Validation des champs requis
    if (!name || !address || !city || !pricePerNight) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez remplir tous les champs obligatoires (nom, adresse, ville, prix)'
      });
    }

    // Validation du prix
    if (pricePerNight <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Le prix par nuit doit être supérieur à 0'
      });
    }

    // Validation de la note
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'La note doit être entre 1 et 5'
      });
    }

    const hotel = new Hotel({
      name,
      description,
      address,
      city,
      pricePerNight,
      rating,
      amenities: amenities || [],
      imageUrl,
      phone,
      email,
      available: available !== undefined ? available : true
    });

    const savedHotel = await hotel.save();
    
    res.status(201).json({
      success: true,
      message: 'Hôtel créé avec succès',
      data: savedHotel
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'hôtel:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de l\'hôtel'
    });
  }
});

// @route   PUT /api/hotels/:id
// @desc    Modifier un hôtel (PROTÉGÉ)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, address, city, pricePerNight, rating, amenities, imageUrl, phone, email, available } = req.body;

    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Mise à jour des champs
    hotel.name = name || hotel.name;
    hotel.description = description || hotel.description;
    hotel.address = address || hotel.address;
    hotel.city = city || hotel.city;
    hotel.pricePerNight = pricePerNight || hotel.pricePerNight;
    hotel.rating = rating || hotel.rating;
    hotel.amenities = amenities || hotel.amenities;
    hotel.imageUrl = imageUrl || hotel.imageUrl;
    hotel.phone = phone || hotel.phone;
    hotel.email = email || hotel.email;
    hotel.available = available !== undefined ? available : hotel.available;

    const updatedHotel = await hotel.save();
    
    res.json({
      success: true,
      message: 'Hôtel modifié avec succès',
      data: updatedHotel
    });
  } catch (error) {
    console.error('Erreur lors de la modification de l\'hôtel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la modification'
    });
  }
});

// @route   DELETE /api/hotels/:id
// @desc    Supprimer un hôtel (PROTÉGÉ)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    await Hotel.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Hôtel supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'hôtel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// @route   GET /api/hotels/stats
// @desc    Obtenir les statistiques des hôtels (PUBLIC)
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    const totalHotels = await Hotel.countDocuments();
    const availableHotels = await Hotel.countDocuments({ available: true });
    const avgPrice = await Hotel.aggregate([
      { $group: { _id: null, avgPrice: { $avg: '$pricePerNight' } } }
    ]);
    const avgRating = await Hotel.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalHotels,
        availableHotels,
        avgPrice: avgPrice[0]?.avgPrice || 0,
        avgRating: avgRating[0]?.avgRating || 0
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;
