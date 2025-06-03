const mongoose = require('mongoose');

const GuestSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Veuillez fournir un email valide']
  },
  phone: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis']
  },
  nationality: String,
  identityDocument: {
    type: String,
    enum: ['passport', 'id_card', 'driving_license', 'other'],
    default: 'passport'
  },
  documentNumber: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Guest', GuestSchema);
