const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guest',
    required: [true, 'Le client est requis']
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'La chambre est requise']
  },
  checkInDate: {
    type: Date,
    required: [true, 'La date d\'arrivée est requise']
  },
  checkOutDate: {
    type: Date,
    required: [true, 'La date de départ est requise']
  },
  status: {
    type: String,
    enum: ['confirmed', 'checked_in', 'checked_out', 'cancelled'],
    default: 'confirmed'
  },
  totalPrice: {
    type: Number,
    required: [true, 'Le prix total est requis']
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'bank_transfer', 'other'],
    default: 'credit_card'
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware pour vérifier que la date de départ est après la date d'arrivée
BookingSchema.pre('save', function(next) {
  if (this.checkOutDate <= this.checkInDate) {
    return next(new Error('La date de départ doit être postérieure à la date d\'arrivée'));
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);