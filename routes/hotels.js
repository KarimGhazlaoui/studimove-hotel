const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');
const { protect } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(protect);

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
    console.error('Erreur lors de la récupération des hôtels:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
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
    console.error('Erreur lors de la récupération de l\'hôtel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// POST /api/hotels - Créer un nouvel hôtel
router.post('/', async (req, res) => {
  try {
    const hotel = await Hotel.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Hôtel créé avec succès',
      data: hotel
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'hôtel:', error);
    res.status(400).json({
      success: false,
      message: 'Erreur lors de la création de l\'hôtel',
      error: error.message
    });
  }
});

// PUT /api/hotels/:id - Mettre à jour un hôtel
router.put('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }
    
    res.json({
      success: true,
      message: 'Hôtel mis à jour avec succès',
      data: hotel
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'hôtel:', error);
    res.status(400).json({
      success: false,
      message: 'Erreur lors de la mise à jour de l\'hôtel',
      error: error.message
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
    console.error('Erreur lors de la suppression de l\'hôtel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;
