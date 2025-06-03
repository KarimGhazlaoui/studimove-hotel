const Guest = require('../models/Guest');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all guests
// @route   GET /api/guests
// @access  Private
exports.getGuests = asyncHandler(async (req, res, next) => {
  const guests = await Guest.find();
  res.status(200).json({ success: true, count: guests.length, data: guests });
});

// @desc    Get single guest
// @route   GET /api/guests/:id
// @access  Private
exports.getGuest = asyncHandler(async (req, res, next) => {
  const guest = await Guest.findById(req.params.id);

  if (!guest) {
    return next(new ErrorResponse(`Client non trouvé avec l'id ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: guest });
});

// @desc    Create new guest
// @route   POST /api/guests
// @access  Private
exports.createGuest = asyncHandler(async (req, res, next) => {
  // Vérifier si l'email existe déjà
  const existingGuest = await Guest.findOne({ email: req.body.email });
  if (existingGuest) {
    return next(new ErrorResponse(`Un client avec l'email ${req.body.email} existe déjà`, 400));
  }

  const guest = await Guest.create(req.body);
  res.status(201).json({ success: true, data: guest });
});

// @desc    Update guest
// @route   PUT /api/guests/:id
// @access  Private
exports.updateGuest = asyncHandler(async (req, res, next) => {
  let guest = await Guest.findById(req.params.id);

  if (!guest) {
    return next(new ErrorResponse(`Client non trouvé avec l'id ${req.params.id}`, 404));
  }

  // Si l'email est modifié, vérifier qu'il n'existe pas déjà
  if (req.body.email && req.body.email !== guest.email) {
    const existingGuest = await Guest.findOne({ email: req.body.email });
    if (existingGuest) {
      return next(new ErrorResponse(`Un client avec l'email ${req.body.email} existe déjà`, 400));
    }
  }

  guest = await Guest.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({ success: true, data: guest });
});

// @desc    Delete guest
// @route   DELETE /api/guests/:id
// @access  Private
exports.deleteGuest = asyncHandler(async (req, res, next) => {
  const guest = await Guest.findById(req.params.id);

  if (!guest) {
    return next(new ErrorResponse(`Client non trouvé avec l'id ${req.params.id}`, 404));
  }

  await guest.deleteOne();

  res.status(200).json({ success: true, data: {} });
});