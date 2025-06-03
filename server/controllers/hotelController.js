const Hotel = require('../models/Hotel');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all hotels
// @route   GET /api/hotels
// @access  Public
exports.getHotels = asyncHandler(async (req, res, next) => {
  const hotels = await Hotel.find();
  res.status(200).json({ success: true, count: hotels.length, data: hotels });
});

// @desc    Get single hotel
// @route   GET /api/hotels/:id
// @access  Public
exports.getHotel = asyncHandler(async (req, res, next) => {
  const hotel = await Hotel.findById(req.params.id);
  
  if (!hotel) {
    return next(new ErrorResponse(`Hôtel non trouvé avec l'id ${req.params.id}`, 404));
  }
  
  res.status(200).json({ success: true, data: hotel });
});

// @desc    Create a new hotel
// @route   POST /api/hotels
// @access  Private
exports.createHotel = async (req, res) => {
  try {

    // Filtrer seulement les champs nécessaires
    const hotelData = {
      name: req.body.name || 'Hôtel sans nom',
      description: req.body.description || 'Description non fournie',
      address: req.body.address || 'Adresse non fournie',
      location: req.body.location || 'Ville non fournie',
      country: req.body.country || 'Pays non fourni',
      category: req.body.category || 'Standard'
    };
    
    const hotel = await Hotel.create(hotelData);
    
    res.status(201).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    console.error('Erreur création hôtel:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update a hotel
// @route   PUT /api/hotels/:id
// @access  Private
exports.updateHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        error: 'Hôtel non trouvé'
      });
    }
    
    res.status(200).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete hotel
// @route   DELETE /api/hotels/:id
// @access  Private
exports.deleteHotel = asyncHandler(async (req, res, next) => {
  const hotel = await Hotel.findById(req.params.id);
  
  if (!hotel) {
    return next(new ErrorResponse(`Hôtel non trouvé avec l'id ${req.params.id}`, 404));
  }
  
  await hotel.deleteOne();
  
  res.status(200).json({ success: true, data: {} });
});
