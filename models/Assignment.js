const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  // 🔗 Références
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
  
  // 🏠 Chambres logiques
  logicalRooms: [{
    logicalRoomId: {
      type: String,
      required: true // "room_1", "room_2", etc.
    },
    roomType: {
      type: String,
      enum: ['VIP', 'Influenceur', 'Staff_Homme', 'Staff_Femme', 'Groupe_Homme', 'Groupe_Femme', 'Mixed'],
      required: true
    },
    bedCount: {
      type: Number,
      required: true,
      min: 1
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1
    },
    
    // 👥 Clients assignés
    assignedClients: [{
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
      },
      assignmentType: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto'
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      assignedBy: {
        type: String, // user_id ou 'system'
        default: 'system'
      }
    }],
    
    // 🏨 Gestion sur place
    realRoomNumber: {
      type: String,
      default: null // Assigné une fois sur place
    },
    
    // 📊 Statistiques
    currentOccupancy: {
      type: Number,
      default: 0
    },
    isFullyOccupied: {
      type: Boolean,
      default: false
    }
  }],
  
  // 📈 Statistiques globales
  stats: {
    totalLogicalRooms: {
      type: Number,
      default: 0
    },
    totalCapacity: {
      type: Number,
      default: 0
    },
    totalAssigned: {
      type: Number,
      default: 0
    },
    occupancyRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  
  // 🔄 Métadonnées
  status: {
    type: String,
    enum: ['Draft', 'Active', 'OnSite', 'Completed'],
    default: 'Draft'
  },
  lastAutoAssignment: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  collection: 'eventhotelassignments'
});

// 🔧 Méthodes
AssignmentSchema.methods.updateStats = function() {
  this.stats.totalLogicalRooms = this.logicalRooms.length;
  this.stats.totalCapacity = this.logicalRooms.reduce((sum, room) => sum + room.maxCapacity, 0);
  this.stats.totalAssigned = this.logicalRooms.reduce((sum, room) => sum + room.assignedClients.length, 0);
  this.stats.occupancyRate = this.stats.totalCapacity > 0 ? 
    Math.round((this.stats.totalAssigned / this.stats.totalCapacity) * 100) : 0;
  
  // Mettre à jour l'occupation des chambres
  this.logicalRooms.forEach(room => {
    room.currentOccupancy = room.assignedClients.length;
    room.isFullyOccupied = room.currentOccupancy >= room.maxCapacity;
  });
};

module.exports = mongoose.model('Assignment', AssignmentSchema);
