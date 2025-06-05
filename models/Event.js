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
    required: [true, 'La date de fin est requise']
    // ✅ VALIDATOR SUPPRIMÉ - Validation faite côté route
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
  if (!this.startDate || !this.endDate) return 0;
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

// ✅ VALIDATION ROBUSTE dans pre-save
EventSchema.pre('save', function(next) {
  console.log('🔍 Pre-save validation Event:', {
    name: this.name,
    startDate: this.startDate,
    endDate: this.endDate
  });

  // Validation des dates
  if (this.startDate && this.endDate) {
    if (this.endDate <= this.startDate) {
      const error = new Error('La date de fin doit être après la date de début');
      error.name = 'ValidationError';
      return next(error);
    }
  }

  // Validation participants
  if (this.maxParticipants && this.currentParticipants > this.maxParticipants) {
    const error = new Error('Le nombre de participants dépasse la limite autorisée');
    error.name = 'ValidationError';
    return next(error);
  }

  console.log('✅ Pre-save validation réussie');
  next();
});

// ✅ VALIDATION pour les updates aussi
EventSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  
  console.log('🔍 Pre-update validation:', update);

  // Si on met à jour les dates, les valider
  if (update.startDate && update.endDate) {
    if (update.endDate <= update.startDate) {
      const error = new Error('La date de fin doit être après la date de début');
      error.name = 'ValidationError';
      return next(error);
    }
  }

  console.log('✅ Pre-update validation réussie');
  next();
});

// Méthodes d'instance
EventSchema.methods.updateParticipantsCount = async function() {
  try {
    const Client = require('./Client');
    const count = await Client.countDocuments({ eventId: this._id });
    this.currentParticipants = count;
    
    // Utiliser updateOne pour éviter les validators
    await mongoose.model('Event').updateOne(
      { _id: this._id },
      { currentParticipants: count }
    );
    
    return this;
  } catch (error) {
    console.error('Erreur updateParticipantsCount:', error);
    throw error;
  }
};

EventSchema.methods.updateHotelsCount = async function() {
  try {
    const Hotel = mongoose.model('Hotel');
    const hotelCount = await Hotel.countDocuments({ eventId: this._id });
    
    const roomsAgg = await Hotel.aggregate([
      { $match: { eventId: this._id } },
      { $unwind: '$roomTypes' },
      { $group: { _id: null, totalRooms: { $sum: '$roomTypes.quantity' } } }
    ]);
    
    const totalRooms = roomsAgg.length > 0 ? roomsAgg[0].totalRooms : 0;
    
    // Utiliser updateOne pour éviter les validators
    await mongoose.model('Event').updateOne(
      { _id: this._id },
      { 
        totalHotels: hotelCount,
        totalRooms: totalRooms
      }
    );
    
    this.totalHotels = hotelCount;
    this.totalRooms = totalRooms;
    
    return this;
  } catch (error) {
    console.error('Erreur updateHotelsCount:', error);
    throw error;
  }
};

// Méthode statique pour validation des dates
EventSchema.statics.validateDates = function(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new Error('Les dates de début et fin sont requises');
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Format de date invalide');
  }
  
  if (end <= start) {
    throw new Error('La date de fin doit être après la date de début');
  }
  
  return { start, end };
};

module.exports = mongoose.model('Event', EventSchema);
