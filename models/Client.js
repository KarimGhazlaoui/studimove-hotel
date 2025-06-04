const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  // 🆕 AJOUT: Référence vers l'événement
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'L\'ID de l\'événement est requis'],
    index: true
  },

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
    maxlength: [20, 'Le téléphone ne peut pas dépasser 20 caractères']
  },

  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'L\'email ne peut pas dépasser 100 caractères']
  },

  // 🆕 AJOUT: Sexe pour l'assignation des chambres
  gender: {
    type: String,
    required: [true, 'Le sexe est requis'],
    enum: {
      values: ['Homme', 'Femme', 'Autre'],
      message: 'Sexe invalide'
    }
  },

  clientType: {
    type: String,
    enum: {
      values: ['VIP', 'Influenceur', 'Staff', 'Groupe', 'Solo'],
      message: 'Type de client invalide'
    },
    default: 'Solo'
  },

  groupName: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom du groupe ne peut pas dépasser 100 caractères']
  },

  groupSize: {
    type: Number,
    default: 1,
    min: [1, 'La taille du groupe doit être au moins de 1'],
    max: [50, 'La taille du groupe ne peut pas dépasser 50']
  },

  // 🆕 AJOUT: Relation de groupe pour la mixité
  groupRelation: {
    type: String,
    enum: ['Famille', 'Couple', 'Amis', 'Collègues', 'Autre'],
    default: 'Amis'
  },

  assignedHotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel'
  },

  // 🆕 AJOUT: Assignation de chambre
  roomAssignment: {
    roomId: String, // ID généré pour la chambre assignée
    roomType: String, // Standard, Suite, etc.
    roomCapacity: Number,
    roommates: [{
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
      name: String,
      gender: String
    }]
  },

  status: {
    type: String,
    enum: {
      values: ['En attente', 'Confirmé', 'Assigné', 'Présent', 'Absent', 'Annulé'],
      message: 'Statut invalide'
    },
    default: 'En attente'
  },

  preferences: {
    roomType: String,
    specialRequests: String,
    accessibility: Boolean,
    dietary: [String] // Végétarien, Sans gluten, etc.
  },

  paymentInfo: {
    status: {
      type: String,
      enum: ['Non payé', 'Acompte', 'Payé', 'Remboursé'],
      default: 'Non payé'
    },
    amount: { type: Number, default: 0 },
    vipSupplement: { type: Number, default: 0 }
  },

  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Les notes ne peuvent pas dépasser 500 caractères']
  },

  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },

  // Metadata
  source: {
    type: String,
    enum: ['Manuel', 'CSV', 'API', 'Web'],
    default: 'Manuel'
  },

  importBatch: String, // ID du lot d'import pour traçabilité

}, {
  timestamps: true
});

// 🆕 Index composés pour optimiser les recherches par événement
ClientSchema.index({ eventId: 1, status: 1 });
ClientSchema.index({ eventId: 1, clientType: 1 });
ClientSchema.index({ eventId: 1, gender: 1 });
ClientSchema.index({ eventId: 1, groupName: 1 });
ClientSchema.index({ eventId: 1, assignedHotel: 1 });

// 🆕 CONTRAINTE: Téléphone unique par événement (pas globalement)
ClientSchema.index({ eventId: 1, phone: 1 }, { unique: true });

// Méthodes virtuelles
ClientSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

ClientSchema.virtual('isVIP').get(function() {
  return this.clientType === 'VIP';
});

ClientSchema.virtual('canBeMixed').get(function() {
  return this.clientType === 'VIP' || this.clientType === 'Influenceur' || 
         (this.groupRelation === 'Famille' || this.groupRelation === 'Couple');
});

ClientSchema.virtual('isAssigned').get(function() {
  return this.assignedHotel && this.roomAssignment && this.roomAssignment.roomId;
});

// Méthodes d'instance
ClientSchema.methods.assignToRoom = function(roomData) {
  this.roomAssignment = {
    roomId: roomData.roomId,
    roomType: roomData.roomType,
    roomCapacity: roomData.capacity,
    roommates: roomData.roommates || []
  };
  this.status = 'Assigné';
  return this.save();
};

ClientSchema.methods.unassignRoom = function() {
  this.roomAssignment = undefined;
  this.status = 'Confirmé';
  return this.save();
};

// Middleware pre-save
ClientSchema.pre('save', function(next) {
  // Validation des groupes
  if (this.clientType === 'Groupe' && !this.groupName) {
    return next(new Error('Le nom du groupe est requis pour un client de type Groupe'));
  }
  
  if (this.clientType === 'Solo') {
    this.groupName = null;
    this.groupSize = 1;
  }
  
  next();
});

module.exports = mongoose.model('Client', ClientSchema);
