const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Guest = require('../models/Guest');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all bookings
// @route   GET /api/bookings
// @route   GET /api/rooms/:roomId/bookings
// @route   GET /api/guests/:guestId/bookings
// @access  Private
exports.getBookings = asyncHandler(async (req, res, next) => {
  let query;

  if (req.params.roomId) {
    query = Booking.find({ room: req.params.roomId });
  } else if (req.params.guestId) {
    query = Booking.find({ guest: req.params.guestId });
  } else {
    query = Booking.find().populate([
      { path: 'guest', select: 'firstName lastName email' },
      { path: 'room', select: 'roomNumber' }
    ]);
  }

  const bookings = await query;

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id).populate([
    { path: 'guest', select: 'firstName lastName email phone' },
    { path: 'room', select: 'roomNumber hotel', populate: { path: 'hotel', select: 'name' } }
  ]);

  if (!booking) {
    return next(new ErrorResponse(`Réservation non trouvée avec l'id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = asyncHandler(async (req, res, next) => {
  // Vérifier si la chambre existe
  const room = await Room.findById(req.body.room);
  if (!room) {
    return next(new ErrorResponse(`Chambre non trouvée avec l'id ${req.body.room}`, 404));
  }

  // Vérifier si le client existe
  const guest = await Guest.findById(req.body.guest);
  if (!guest) {
    return next(new ErrorResponse(`Client non trouvé avec l'id ${req.body.guest}`, 404));
  }

  // Vérifier la disponibilité de la chambre pour les dates demandées
  const checkInDate = new Date(req.body.checkInDate);
  const checkOutDate = new Date(req.body.checkOutDate);

  // Vérifier que la date de départ est après la date d'arrivée
  if (checkOutDate <= checkInDate) {
    return next(new ErrorResponse(`La date de départ doit être postérieure à la date d'arrivée`, 400));
  }

  // Chercher des réservations existantes pour cette chambre qui se chevauchent
  const existingBookings = await Booking.find({
    room: req.body.room,
    status: { $ne: 'cancelled' },
    $or: [
      { checkInDate: { $lt: checkOutDate }, checkOutDate: { $gt: checkInDate } }
    ]
  });

  if (existingBookings.length > 0) {
    return next(new ErrorResponse(`Cette chambre n'est pas disponible pour les dates sélectionnées`, 400));
  }

  // Calculer le prix total (peut être personnalisé selon vos besoins)
  const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
  req.body.totalPrice = nights * room.price;
  
  // Si la chambre est privée, ajouter le coût de privatisation
  if (room.isPrivate && req.body.isPrivatized) {
    req.body.totalPrice += room.privatizationCost;
  }

  const booking = await Booking.create(req.body);

  res.status(201).json({
    success: true,
    data: booking
  });
});

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private
exports.updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Réservation non trouvée avec l'id ${req.params.id}`, 404));
  }

  // Si les dates sont modifiées, vérifier la disponibilité
  if (req.body.checkInDate || req.body.checkOutDate) {
    const checkInDate = new Date(req.body.checkInDate || booking.checkInDate);
    const checkOutDate = new Date(req.body.checkOutDate || booking.checkOutDate);

    if (checkOutDate <= checkInDate) {
      return next(new ErrorResponse(`La date de départ doit être postérieure à la date d'arrivée`, 400));
    }

    // Vérifier si les nouvelles dates se chevauchent avec d'autres réservations
    const existingBookings = await Booking.find({
      _id: { $ne: req.params.id },
      room: booking.room,
      status: { $ne: 'cancelled' },
      $or: [
        { checkInDate: { $lt: checkOutDate }, checkOutDate: { $gt: checkInDate } }
      ]
    });

    if (existingBookings.length > 0) {
      return next(new ErrorResponse(`Cette chambre n'est pas disponible pour les dates sélectionnées`, 400));
    }
  }

  booking = await Booking.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private
exports.deleteBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Réservation non trouvée avec l'id ${req.params.id}`, 404));
  }

  await booking.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});