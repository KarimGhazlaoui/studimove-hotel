const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');

// GET /api/hotels - Récupérer tous les hôtels
router.get('/', async (req, res) => {
  try {
    const hotels = await Hotel.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    console.error('Erreur GET hotels:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des hôtels'
    });
  }
});

// POST /api/hotels - Créer un nouvel hôtel
router.post('/', async (req, res) => {
  try {
    console.log('📥 Données reçues:', req.body);
    
    // SUPPRIMEZ LA VALIDATION MANUELLE - Laissez Mongoose gérer
    // Créer l'hôtel directement
    const hotel = new Hotel(req.body);
    const savedHotel = await hotel.save();
    
    console.log('✅ Hôtel créé:', savedHotel);
    
    res.status(201).json({
      success: true,
      data: savedHotel
    });
  } catch (error) {
    console.error('❌ Erreur POST hotel:', error);
    
    // Erreur de validation Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de l\'hôtel'
    });
  }
});

// GET /api/hotels/:id - Récupérer un hôtel par ID
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
    console.error('Erreur GET hotel by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// PUT /api/hotels/:id - Mettre à jour un hôtel
router.put('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
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
    console.error('Erreur PUT hotel:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour'
    });
  }
});

// DELETE /api/hotels/:id - Supprimer un hôtel
router.delete('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findByIdAndDelete(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }
    
    res.json({
      success: true,
      message: 'Hôtel supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur DELETE hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

module.exports = router;
