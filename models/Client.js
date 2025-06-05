const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  // 🎯 ÉVÉNEMENT (obligatoire - un client appartient à un événement)
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'L\'ID de l\'événement est requis'],
    index: true
  },

  // 👤 INFORMATIONS PERSONNELLES (obligatoires)
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut dépasser 50 caractères']
  }, 

  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut dépasser 50 caractères']
  }, 

  phone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[\d\s\+\-\(\)]{10,20}$/.test(v);
      },
      message: 'Format de téléphone invalide'
    }
  }, 

  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return !v || /^[\w\.-]+@[\w\.-]+\.\w+$/.test(v);
      },
      message: 'Format d\'email invalide'
    }
  },

  // ⚧️ SEXE (obligatoire pour assignation par genre)
  gender: {
    type: String,
    required: [true, 'Le sexe est requis pour l\'assignation des chambres'],
    enum: {
      values: ['Homme', 'Femme', 'Autre'],
      message: 'Le sexe doit être Homme, Femme ou Autre'
    },
    index: true
  },

  // 🏷️ TYPE DE CLIENT (obligatoire pour priorités d'assignation)
  clientType: {
    type: String,
    required: [true, 'Le type de client est requis'],
    enum: {
      values: ['VIP', 'Influenceur', 'Staff', 'Standard'],
      message: 'Le type doit être VIP, Influenceur, Staff ou Standard'
    },
    default: 'Standard',
    index: true
  },

  // 👥 GROUPE (optionnel)
  groupName: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom du groupe ne peut dépasser 100 caractères'],
    index: true
  }, 

  // 🆕 TAILLE DU GROUPE (NOUVEAU CHAMP !)
  groupSize: {
    type: Number,
    default: 1,
    min: [1, 'La taille du groupe doit être au moins 1'],
    max: [50, 'La taille du groupe ne peut dépasser 50'],
    validate: {
      validator: Number.isInteger,
      message: 'La taille du groupe doit être un nombre entier'
    }
  },

  groupRelation: {
    type: String,
    enum: ['Famille', 'Couple', 'Amis', 'Collègues', 'Autre'],
    default: 'Amis'
  },

  // 📋 STATUT ET SUIVI
  status: {
    type: String,
    enum: {
      values: ['En attente', 'Confirmé', 'Assigné', 'Arrivé', 'Parti'],
      message: 'Statut invalide'
    },
    default: 'En attente',
    index: true
  },

  // 📝 NOTES ET PRÉFÉRENCES
  notes: {
    type: String,
    maxlength: [500, 'Les notes ne peuvent dépasser 500 caractères'],
    default: ''
  },

  preferences: {
    // Préférences d'hébergement
    roomType: {
      type: String,
      enum: ['Standard', 'Suite', 'Familiale', 'Accessible'],
      default: 'Standard'
    },
    floorPreference: {
      type: String,
      enum: ['Bas', 'Haut', 'Indifférent'],
      default: 'Indifférent'
    },
    specialNeeds: {
      type: String,
      maxlength: [200, 'Les besoins spéciaux ne peuvent dépasser 200 caractères']
    },
    // Préférences alimentaires pour événements
    dietaryRestrictions: [{
      type: String,
      enum: ['Végétarien', 'Végétalien', 'Halal', 'Casher', 'Sans gluten', 'Allergies']
    }],
    allergies: String
  },

  // 🏨 ASSIGNATION HÔTEL
  assignedHotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    index: true
  },

  // 🛏️ ASSIGNATION CHAMBRE
  logicalRoomId: {
    type: String,
    trim: true
  }, 

  realRoomNumber: {
    type: String,
    trim: true
  },

  bedAssignment: {
    type: String,
    enum: ['Lit 1', 'Lit 2', 'Lit 3', 'Lit 4'],
    sparse: true
  },

  assignmentType: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto'
  },

  assignmentDate: {
    type: Date
  },

  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // 📊 MÉTADONNÉES
  source: {
    type: String,
    enum: ['Manuel', 'CSV', 'API'],
    default: 'Manuel',
    index: true
  },

  importBatch: {
    type: String,
    index: true
  },

  // 🕐 TIMESTAMPS
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  // 🗓️ DATES IMPORTANTES
  confirmationDate: Date,
  arrivalDate: Date,
  departureDate: Date

}, {
  // Options du schéma
  timestamps: true, // Ajoute automatiquement createdAt et updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🔍 INDEX COMPOSÉS POUR PERFORMANCE
clientSchema.index({ eventId: 1, phone: 1 }, { unique: true }); // Unicité par événement
clientSchema.index({ eventId: 1, groupName: 1 }); // Requêtes par groupe
clientSchema.index({ eventId: 1, clientType: 1 }); // Requêtes par type
clientSchema.index({ eventId: 1, gender: 1 }); // Requêtes par sexe
clientSchema.index({ eventId: 1, status: 1 }); // Requêtes par statut
clientSchema.index({ assignedHotel: 1, status: 1 }); // Clients par hôtel

// 📐 PROPRIÉTÉS VIRTUELLES
clientSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

clientSchema.virtual('displayPhone').get(function() {
  // Formate le téléphone pour affichage
  const phone = this.phone.replace(/\D/g, '');
  if (phone.length === 10) {
    return phone.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }
  return this.phone;
});

clientSchema.virtual('isAssigned').get(function() {
  return !!this.assignedHotel;
});

clientSchema.virtual('isInGroup').get(function() {
  return !!this.groupName;
});

clientSchema.virtual('isPriority').get(function() {
  return ['VIP', 'Influenceur', 'Staff'].includes(this.clientType);
});

// 🆕 PROPRIÉTÉ VIRTUELLE POUR LA TAILLE AFFICHÉE
clientSchema.virtual('displayGroupInfo').get(function() {
  if (this.groupName) {
    return `${this.groupName} (${this.groupSize})`;
  } else if (this.clientType === 'Staff') {
    return `Staff (${this.groupSize})`;
  } else {
    return `Solo (${this.groupSize})`;
  }
});

// 🔧 MÉTHODES D'INSTANCE
clientSchema.methods.assignToHotel = function(hotelId, roomId, assignedByUserId) {
  this.assignedHotel = hotelId;
  this.logicalRoomId = roomId;
  this.assignmentDate = new Date();
  this.assignedBy = assignedByUserId;
  this.status = 'Assigné';
  return this.save();
};

clientSchema.methods.unassign = function() {
  this.assignedHotel = null;
  this.logicalRoomId = null;
  this.realRoomNumber = null;
  this.bedAssignment = null;
  this.assignmentDate = null;
  this.assignedBy = null;
  this.status = 'Confirmé';
  return this.save();
};

clientSchema.methods.markAsArrived = function() {
  this.status = 'Arrivé';
  this.arrivalDate = new Date();
  return this.save();
};

// 📊 MÉTHODES STATIQUES
clientSchema.statics.getEventStats = async function(eventId) {
  const stats = await this.aggregate([
    { $match: { eventId: mongoose.Types.ObjectId(eventId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byGender: {
          $push: {
            gender: '$gender',
            type: '$clientType',
            assigned: { $cond: [{ $ne: ['$assignedHotel', null] }, 1, 0] }
          }
        },
        assigned: { $sum: { $cond: [{ $ne: ['$assignedHotel', null] }, 1, 0] } },
        vips: { $sum: { $cond: [{ $eq: ['$clientType', 'VIP'] }, 1, 0] } },
        influenceurs: { $sum: { $cond: [{ $eq: ['$clientType', 'Influenceur'] }, 1, 0] } },
        staff: { $sum: { $cond: [{ $eq: ['$clientType', 'Staff'] }, 1, 0] } },
        groups: { $addToSet: '$groupName' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    assigned: 0,
    vips: 0,
    influenceurs: 0,
    staff: 0,
    groups: []
  };
};

clientSchema.statics.getGroupSizes = async function(eventId) {
  return await this.aggregate([
    {
      $match: {
        eventId: mongoose.Types.ObjectId(eventId),
        groupName: { $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$groupName',
        memberCount: { $sum: 1 },
        totalGroupSize: { $first: '$groupSize' }, // 🆕 TAILLE CALCULÉE
        genders: { $addToSet: '$gender' },
        types: { $addToSet: '$clientType' },
        members: {
          $push: {
            id: '$_id',
            name: '$fullName',
            gender: '$gender',
            type: '$clientType',
            phone: '$phone',
            assigned: '$assignedHotel'
          }
        }
      }
    },
    {
      $addFields: {
        isMixed: { $gt: [{ $size: '$genders' }, 1] },
        hasPriority: {
          $anyElementTrue: {
            $map: {
              input: '$types',
              as: 'type',
              in: { $in: ['$$type', ['VIP', 'Influenceur', 'Staff']] }
            }
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// 🔄 MIDDLEWARE PRE-SAVE
clientSchema.pre('save', function(next) {
  // Mise à jour automatique du timestamp
  this.updatedAt = new Date();
  
  // Nettoyage des données
  if (this.groupName === '' || this.groupName === 'solo') {
    this.groupName = null;
  }
  
  // 🆕 VALIDATION LOGIQUE GROUPSIZE
  if (!this.groupName && this.clientType !== 'Staff') {
    this.groupSize = 1; // Solo = taille 1
  }
  
  // Validation logique métier
  if (this.clientType === 'VIP' && !this.notes) {
    this.notes = 'Client VIP - Traitement prioritaire';
  }
  
  next();
});

// 🔄 MIDDLEWARE POST-SAVE
clientSchema.post('save', async function(doc) {
  // Mettre à jour les statistiques de l'événement
  try {
    const Event = mongoose.model('Event');
    const event = await Event.findById(doc.eventId);
    if (event) {
      await event.updateParticipantsCount();
    }
  } catch (error) {
    console.error('Erreur mise à jour stats événement:', error);
  }
});

// 🔄 MIDDLEWARE POST-REMOVE
clientSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    // Nettoyer les assignations d'hôtel
    if (doc.assignedHotel) {
      try {
        const Hotel = mongoose.model('Hotel');
        const hotel = await Hotel.findById(doc.assignedHotel);
        if (hotel) {
          await hotel.updateAssignedClients();
        }
      } catch (error) {
        console.error('Erreur nettoyage hotel:', error);
      }
    }
  }
});

// 🏷️ EXPORT DU MODÈLE
module.exports = mongoose.model('Client', clientSchema);
