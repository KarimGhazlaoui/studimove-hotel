const express = require('express');
const {
  getHotels,
  getHotel,
  createHotel,
  updateHotel,
  deleteHotel
} = require('../controllers/hotelController');

// Inclure les autres routes
const roomRouter = require('./rooms');

const router = express.Router();

// Re-router vers d'autres routers
router.use('/:hotelId/rooms', roomRouter);

router.get('/', async (req, res) => {
  try {
    console.log('📝 Requête reçue pour GET /api/hotels');
    console.log('📝 État MongoDB:', mongoose.connection.readyState);
    
    const hotels = await Hotel.find();
    console.log('📝 Hôtels récupérés:', hotels.length);
    
    res.json({
      success: true,
      data: hotels
    });
  } catch (error) {
    console.error('❌ Erreur détaillée:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Exemple de route sur le backend
router.get('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hôtel non trouvé' });
    }
    
    res.json({ success: true, data: hotel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router
  .route('/:id')
  .put(updateHotel)
  .delete(deleteHotel);

module.exports = router;
