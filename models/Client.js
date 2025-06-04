const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  phone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[\+]?[\d\s\-\(\)]{8,}$/.test(v);
      },
      message: 'Format de téléphone invalide'
    }
  },
  type: {
    type: String,
    enum: ['Solo', 'Groupe'],
    required: [true, 'Le type (Solo/Groupe) est requis'],
    default: 'Solo'
  },
  groupSize: {
    type: Number,
    min: [1, 'La taille du groupe doit être au minimum 1'],
    max: [20, 'La taille du groupe ne peut pas dépasser 20'],
    default: 1
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Les notes ne peuvent pas dépasser 500 caractères']
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
ClientSchema.index({ firstName: 1, lastName: 1 });
ClientSchema.index({ phone: 1 });

// Méthode virtuelle pour le nom complet
ClientSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Assurer que les virtuels sont inclus dans JSON
ClientSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Client', ClientSchema);