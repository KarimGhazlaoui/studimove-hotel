const mongoose = require('mongoose');

const HotelSchema = new mongoose.Schema({
  // 🆕 AJOUT: Référence vers l'événement
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'L\'ID de l\'événement est requis'],
    index: true
  },
  
  name: {
    type: String,
    required: [true, 'Le nom de l\'hôtel est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  
  address: {
    street: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    zipCode: { type: String, trim: true },
    coordinates: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 }
    }
  },
  
  contact: {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: { type: String, trim: true }
  },
  
  roomTypes: [{
    type: {
      type: String,
      required: true,
      enum: ['Standard', 'Superior', 'Suite', 'Deluxe', 'Premium'],
      default: 'Standard'
    },
    capacity: {
      type: Number,
      required: true,
      min: [1, 'La capacité doit être au moins de 1'],
      max: [20, 'La capacité ne peut pas dépasser 20']
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'La quantité doit être au moins de 1'],
      max: [1000, 'La quantité ne peut pas dépasser 1000']
    },
    bedType: {
      type: String,
      enum: ['Single', 'Twin', 'Double', 'Queen', 'King', 'Bunk'],
      default: 'Twin'
    },
    amenities: [String] // WiFi, AC, TV, etc.
  }],
  
  facilities: [String], // Pool, Gym, Restaurant, etc.
  
  rating: {
    type: Number,
    min: [1, 'La note doit être au moins de 1'],
    max: [5, 'La note ne peut pas dépasser 5'],
    default: 3
  },
  
  priceRange: {
    min: { type: Number, min: 0 },
    max: { type: Number, min: 0 }
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
  },
  
  images: [String], // URLs des images
  
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Maintenance'],
    default: 'Active'
  },
  
  // Statistiques
  totalRooms: {
    type: Number,
    default: 0
  },
  totalCapacity: {
    type: Number,
    default: 0
  },
  assignedClients: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index composé pour optimiser les recherches par événement
HotelSchema.index({ eventId: 1, status: 1 });
HotelSchema.index({ eventId: 1, 'address.city': 1 });

// 🆕 CONTRAINTE: Nom unique par événement (pas globalement)
HotelSchema.index({ eventId: 1, name: 1 }, { unique: true });

// Méthodes virtuelles
HotelSchema.virtual('totalRoomsCalculated').get(function() {
  return this.roomTypes.reduce((total, room) => total + room.quantity, 0);
});

HotelSchema.virtual('totalCapacityCalculated').get(function() {
  return this.roomTypes.reduce((total, room) => total + (room.quantity * room.capacity), 0);
});

HotelSchema.virtual('occupancyRate').get(function() {
  if (this.totalCapacity === 0) return 0;
  return Math.round((this.assignedClients / this.totalCapacity) * 100);
});

// Middleware pre-save pour calculer les totaux
HotelSchema.pre('save', function(next) {
  this.totalRooms = this.totalRoomsCalculated;
  this.totalCapacity = this.totalCapacityCalculated;
  next();
});

// Méthodes d'instance
HotelSchema.methods.updateAssignedClients = async function() {
  const Client = mongoose.model('Client');
  const count = await Client.countDocuments({ 
    assignedHotel: this._id,
    eventId: this.eventId 
  });
  this.assignedClients = count;
  return this.save();
};

HotelSchema.methods.getAvailableCapacity = function() {
  return this.totalCapacity - this.assignedClients;
};

HotelSchema.methods.getRoomTypesByCapacity = function(minCapacity = 1) {
  return this.roomTypes
    .filter(room => room.capacity >= minCapacity)
    .sort((a, b) => a.capacity - b.capacity);
};

module.exports = mongoose.model('Hotel', HotelSchema);
