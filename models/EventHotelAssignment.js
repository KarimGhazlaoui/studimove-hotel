const mongoose = require('mongoose');

const EventHotelAssignmentSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  // Configuration des chambres disponibles pour cet événement
  availableRooms: [{
    bedCount: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    pricePerNight: {
      type: Number,
      default: 0
    },
    // Chambres déjà assignées
    assignedRooms: {
      type: Number,
      default: 0
    }
  }],
  // Statistiques calculées
  totalCapacity: {
    type: Number,
    default: 0
  },
  totalAssigned: {
    type: Number,
    default: 0
  },
  // Statut
  status: {
    type: String,
    enum: ['Active', 'Suspendu', 'Complet'],
    default: 'Active'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index unique pour éviter les doublons
EventHotelAssignmentSchema.index({ eventId: 1, hotelId: 1 }, { unique: true });

// Méthodes virtuelles
EventHotelAssignmentSchema.virtual('availableCapacity').get(function() {
  return this.totalCapacity - this.totalAssigned;
});

EventHotelAssignmentSchema.virtual('occupancyRate').get(function() {
  return this.totalCapacity > 0 ? (this.totalAssigned / this.totalCapacity) * 100 : 0;
});

// Méthodes d'instance
EventHotelAssignmentSchema.methods.updateStats = function() {
  // Calculer la capacité totale
  this.totalCapacity = this.availableRooms.reduce((sum, room) => 
    sum + (room.quantity * room.bedCount), 0);
  
  // Calculer les assignations totales
  this.totalAssigned = this.availableRooms.reduce((sum, room) => 
    sum + (room.assignedRooms * room.bedCount), 0);
  
  // Mettre à jour le statut
  if (this.totalAssigned >= this.totalCapacity) {
    this.status = 'Complet';
  } else if (this.totalAssigned > 0) {
    this.status = 'Active';
  }
  
  return this.save();
};

// Middleware pre-save
EventHotelAssignmentSchema.pre('save', function(next) {
  // Calculer automatiquement les stats
  this.totalCapacity = this.availableRooms.reduce((sum, room) => 
    sum + (room.quantity * room.bedCount), 0);
  
  this.totalAssigned = this.availableRooms.reduce((sum, room) => 
    sum + (room.assignedRooms * room.bedCount), 0);
  
  next();
});

module.exports = mongoose.model('EventHotelAssignment', EventHotelAssignmentSchema);