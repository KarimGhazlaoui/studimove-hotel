const mongoose = require('mongoose');

const HotelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Veuillez ajouter un nom'],
    unique: true,
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  description: {
    type: String,
    required: [true, 'Veuillez ajouter une description'],
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },
  address: {
    type: String,
    required: [true, 'Veuillez ajouter une adresse']
  },
  location: {
    type: String,
    required: [true, 'Veuillez ajouter une ville']
  },
  country: {
    type: String,
    required: [true, 'Veuillez ajouter un pays']
  },
  category: {
    type: String,
    enum: ['Économique', 'Standard', 'Luxe', 'Resort', 'Boutique'],
    default: 'Standard'
  },
  rating: {
    type: Number,
    min: [1, 'La note minimale est 1'],
    max: [5, 'La note maximale est 5']
  },
  phone: String,
  email: {
    type: String,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Veuillez ajouter un email valide'
    ]
  },
  website: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Hotel', HotelSchema);
