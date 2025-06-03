const mongoose = require('mongoose');

const HotelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de l\'hôtel est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  address: {
    type: String,
    trim: true  // PAS REQUIS
  },
  location: {  // CHANGÉ DE city vers location
    type: String,
    required: [true, 'La ville est requise'],
    trim: true
  },
  country: {
    type: String,
    required: [true, 'Le pays est requis'],
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  website: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
  },
  pricePerNight: {  // CHANGÉ DE price vers pricePerNight
    type: Number,
    min: [0, 'Le prix doit être positif']
    // PAS REQUIS
  },
  rating: {
    type: Number,
    min: [0, 'La note minimum est 0'],  // CHANGÉ DE 1 vers 0
    max: [5, 'La note maximum est 5'],
    default: null
  },
  category: {  // AJOUTÉ pour correspondre au frontend
    type: String,
    enum: ['Hotel', 'Resort', 'Residence', 'Auberge', 'Aparthotel'],
    default: 'Hotel'
  },
  amenities: [{
    type: String,
    trim: true
  }],
  images: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Hotel', HotelSchema);
