const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de l\'événement est requis'],
    unique: true,
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  country: {
    type: String,
    required: [true, 'Le pays est requis'],
    trim: true,
    maxlength: [50, 'Le pays ne peut pas dépasser 50 caractères']
  },
  city: {
    type: String,
    required: [true, 'La ville est requise'],
    trim: true,
    maxlength: [50, 'La ville ne peut pas dépasser 50 caractères']
  },
  startDate: {
    type: Date,
    required: [true, 'La date de début est requise']
  },
  endDate: {
    type: Date,
    required: [true, 'La date de fin est requise'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'La date de fin doit être après la date de début'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },
  status: {
    type: String,
    enum: {
      values: ['Planification', 'Active', 'Terminé', 'Annulé'],
      message: 'Statut invalide'
    },
    default: 'Planification'
  },
  maxParticipants: {
    type: Number,
    min: [1, 'Le nombre maximum de participants doit être au moins 1'],
    max: [10000, 'Le nombre maximum de participants ne peut pas dépasser 10000']
  },
  currentParticipants: {
    type: Number,
    default: 0,
    min: [0, 'Le nombre de participants ne peut pas être négatif']
  },
  // Statistiques
  totalHotels: {
    type: Number,
    default: 0
  },
  totalRooms: {
    type: Number,
    default: 0
  },
  // Configuration
  allowMixedGroups: {
    type: Boolean,
    default: false // Par défaut, séparation par sexe obligatoire
  },
  vipPrice: {
    type: Number,
    default: 0 // Supplément VIP
  }
}, {
  timestamps: true
});

// Index pour optimiser les recherches
EventSchema.index({ status: 1, startDate: 1 });
EventSchema.index({ name: 1 });

// Méthodes virtuelles
EventSchema.virtual('duration').get(function() {
  const diffTime = this.endDate - this.startDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

EventSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.startDate <= now && this.endDate >= now && this.status === 'Active';
});

EventSchema.virtual('isFull').get(function() {
  return this.maxParticipants && this.currentParticipants >= this.maxParticipants;
});

// Méthodes d'instance
EventSchema.methods.updateParticipantsCount = async function() {
  const Client = require('./Client'); // ← Import direct
  const count = await Client.countDocuments({ eventId: this._id });
  this.currentParticipants = count;
  return this.save();
};

EventSchema.methods.updateHotelsCount = async function() {
  const Hotel = mongoose.model('Hotel');
  const hotelCount = await Hotel.countDocuments({ eventId: this._id });
  
  const roomsAgg = await Hotel.aggregate([
    { $match: { eventId: this._id } },
    { $unwind: '$roomTypes' },
    { $group: { _id: null, totalRooms: { $sum: '$roomTypes.quantity' } } }
  ]);
  
  this.totalHotels = hotelCount;
  this.totalRooms = roomsAgg.length > 0 ? roomsAgg[0].totalRooms : 0;
  return this.save();
};

// Middleware pre-save
EventSchema.pre('save', function(next) {
  // Validation supplémentaire
  if (this.maxParticipants && this.currentParticipants > this.maxParticipants) {
    return next(new Error('Le nombre de participants dépasse la limite autorisée'));
  }
  next();
});

module.exports = mongoose.model('Event', EventSchema);