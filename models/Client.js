const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Solo', 'Groupe'],
    default: 'Solo'
  },
  groupName: {
    type: String,
    trim: true,
    default: null
  },
  groupSize: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
    default: 1
  },
  notes: {
    type: String,
    maxlength: 500,
    default: ''
  },
  // Ajout pour la répartition future
  assignedHotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    default: null
  },
  assignedRoom: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['En attente', 'Assigné', 'Confirmé'],
    default: 'En attente'
  }
}, {
  timestamps: true
});

// Index pour la recherche
ClientSchema.index({ firstName: 'text', lastName: 'text', phone: 'text', groupName: 'text' });

// Index pour grouper par nom de groupe
ClientSchema.index({ groupName: 1, type: 1 });

// Méthode virtuelle pour le nom complet
ClientSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Assurer que les virtuels sont inclus dans JSON
ClientSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Client', ClientSchema);