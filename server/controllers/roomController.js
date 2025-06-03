const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all rooms
// @route   GET /api/rooms
// @route   GET /api/hotels/:hotelId/rooms
// @access  Public
exports.getRooms = asyncHandler(async (req, res, next) => {
  let query;

  if (req.params.hotelId) {
    query = Room.find({ hotel: req.params.hotelId });
  } else {
    query = Room.find().populate({
      path: 'hotel',
      select: 'name address'
    });
  }

  const rooms = await query;

  res.status(200).json({
    success: true,
    count: rooms.length,
    data: rooms
  });
});

// @desc    Get single room
// @route   GET /api/rooms/:id
// @access  Public
exports.getRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id).populate({
    path: 'hotel',
    select: 'name address'
  });

  if (!room) {
    return next(new ErrorResponse(`Chambre non trouvée avec l'id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: room
  });
});

// @desc    Create room
// @route   POST /api/hotels/:hotelId/rooms
// @access  Private
exports.createRoom = asyncHandler(async (req, res, next) => {
  req.body.hotel = req.params.hotelId;

  const hotel = await Hotel.findById(req.params.hotelId);

  if (!hotel) {
    return next(new ErrorResponse(`Hôtel non trouvé avec l'id ${req.params.hotelId}`, 404));
  }

  const room = await Room.create(req.body);

  res.status(201).json({
    success: true,
    data: room
  });
});

// @desc    Update room
// @route   PUT /api/rooms/:id
// @access  Private
exports.updateRoom = asyncHandler(async (req, res, next) => {
  let room = await Room.findById(req.params.id);

  if (!room) {
    return next(new ErrorResponse(`Chambre non trouvée avec l'id ${req.params.id}`, 404));
  }

  room = await Room.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: room
  });
});

// @desc    Delete room
// @route   DELETE /api/rooms/:id
// @access  Private
exports.deleteRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(new ErrorResponse(`Chambre non trouvée avec l'id ${req.params.id}`, 404));
  }

  // Vérifier s'il y a des réservations pour cette chambre
  const bookings = await Booking.find({ room: req.params.id });
  if (bookings.length > 0) {
    return next(new ErrorResponse(`Impossible de supprimer cette chambre car elle a des réservations`, 400));
  }

  await room.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});
