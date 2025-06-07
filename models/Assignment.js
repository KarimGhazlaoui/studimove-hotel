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
      enum: ['VIP', 'Influenceur', 'Staff_Homme', 'Staff_Femme', 'Groupe_Homme', 'Groupe_Femme', 'Mixed', 'Standard'],
      required: true,
      default: 'Standard' // ✅ AJOUT DEFAULT
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
    
    // ✅ AJOUT : Nombre de chambres de ce type disponibles
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    
    // ✅ AJOUT : Prix par nuit
    pricePerNight: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // ✅ AJOUT : Nombre de chambres de ce type déjà assignées
    assignedRooms: {
      type: Number,
      default: 0,
      min: 0
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

// Index unique pour éviter les doublons
AssignmentSchema.index({ eventId: 1, hotelId: 1 }, { unique: true });

// ✅ MÉTHODES MISES À JOUR
AssignmentSchema.methods.updateStats = function() {
  this.stats.totalLogicalRooms = this.logicalRooms.length;
  
  // ✅ CORRIGÉ : Calcul de la capacité totale avec quantity
  this.stats.totalCapacity = this.logicalRooms.reduce((sum, room) => 
    sum + (room.quantity * room.maxCapacity), 0);
  
  // ✅ CORRIGÉ : Calcul des assignations avec quantity et assignedRooms
  this.stats.totalAssigned = this.logicalRooms.reduce((sum, room) => 
    sum + (room.assignedRooms * room.maxCapacity), 0);
  
  this.stats.occupancyRate = this.stats.totalCapacity > 0 ?
    Math.round((this.stats.totalAssigned / this.stats.totalCapacity) * 100) : 0;
  
  // Mettre à jour l'occupation des chambres
  this.logicalRooms.forEach(room => {
    room.currentOccupancy = room.assignedClients.length;
    room.isFullyOccupied = room.assignedRooms >= room.quantity; // ✅ CORRIGÉ
  });
  
  return this.save();
};

// ✅ AJOUT : Méthode pour obtenir la capacité disponible
AssignmentSchema.methods.getAvailableCapacity = function() {
  return this.stats.totalCapacity - this.stats.totalAssigned;
};

// ✅ AJOUT : Méthode pour obtenir les chambres disponibles par type
AssignmentSchema.methods.getAvailableRoomsByType = function(roomType = null) {
  return this.logicalRooms
    .filter(room => !roomType || room.roomType === roomType)
    .filter(room => room.assignedRooms < room.quantity)
    .map(room => ({
      ...room.toObject(),
      availableRooms: room.quantity - room.assignedRooms,
      availableCapacity: (room.quantity - room.assignedRooms) * room.maxCapacity
    }));
};

// ✅ AJOUT : Méthode pour assigner une chambre
AssignmentSchema.methods.assignRoom = function(logicalRoomId, clientId, assignedBy = 'system') {
  const room = this.logicalRooms.find(r => r.logicalRoomId === logicalRoomId);
  
  if (!room) {
    throw new Error('Chambre logique non trouvée');
  }
  
  if (room.assignedRooms >= room.quantity) {
    throw new Error('Aucune chambre disponible pour ce type');
  }
  
  // Vérifier si le client n'est pas déjà assigné
  const isAlreadyAssigned = room.assignedClients.some(
    client => client.clientId.toString() === clientId.toString()
  );
  
  if (isAlreadyAssigned) {
    throw new Error('Client déjà assigné à cette chambre');
  }
  
  // Ajouter le client
  room.assignedClients.push({
    clientId,
    assignmentType: 'manual',
    assignedBy
  });
  
  // Mettre à jour les statistiques
  this.updateStats();
  
  return room;
};

// Middleware pre-save pour calculer automatiquement les stats
AssignmentSchema.pre('save', function(next) {
  this.updateStats();
  next();
});

module.exports = mongoose.model('Assignment', AssignmentSchema);
