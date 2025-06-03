const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  hotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: [true, 'L\'hôtel est requis']
  },
  roomNumber: {
    type: String,
    required: [true, 'Le numéro de chambre est requis'],
    trim: true
  },
  capacity: {
    type: Number,
    required: [true, 'La capacité est requise'],
    min: [1, 'La capacité minimum est de 1 personne']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'mixed'],
    default: 'mixed'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  privatizationCost: {
    type: Number,
    default: 0
  },
  price: {
    type: Number,
    required: [true, 'Le prix est requis'],
    min: [0, 'Le prix ne peut pas être négatif']
  },
  amenities: [String],
  description: String,
  status: {
    type: String,
    enum: ['available', 'occupied', 'maintenance'],
    default: 'available'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', RoomSchema);
