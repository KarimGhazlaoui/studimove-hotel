const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Hotel = require('../models/Hotel');
const Event = require('../models/Event');

// POST /api/assignments/preview/:eventId - Aperçu des assignations suggérées
router.post('/preview/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { forceReassign = false } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Récupérer les clients à assigner
    const clientsFilter = { eventId };
    if (!forceReassign) {
      clientsFilter.assignedHotel = { $exists: false }; // Seulement les non-assignés
    }

    const clients = await Client.find(clientsFilter).sort('clientType gender groupName');
    const hotels = await Hotel.find({ eventId }).sort('name');

    if (clients.length === 0) {
      return res.json({
        success: true,
        message: 'Aucun client à assigner',
        data: {
          totalAssigned: 0,
          roomsUsed: 0,
          assignments: [],
          warnings: []
        }
      });
    }

    // Algorithme d'assignation (version simplifiée)
    const suggestions = await generateAssignmentSuggestions(clients, hotels, event);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Erreur preview assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération des suggestions'
    });
  }
});

// POST /api/assignments/confirm/:eventId - Confirmer les assignations
router.post('/confirm/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { assignments } = req.body; // Assignations validées par l'utilisateur

    let assignedCount = 0;
    const errors = [];

    // Traiter chaque assignation
    for (const assignment of assignments) {
      try {
        for (const clientAssignment of assignment.clients) {
          await Client.findByIdAndUpdate(clientAssignment.clientId, {
            assignedHotel: assignment.hotelId,
            roomAssignment: {
              roomId: assignment.roomId,
              roomType: assignment.roomType,
              roomCapacity: assignment.capacity,
              roommates: assignment.clients.map(c => ({
                clientId: c.clientId,
                name: c.name,
                gender: c.gender
              }))
            },
            status: 'Assigné'
          });
          assignedCount++;
        }
      } catch (error) {
        errors.push(`Erreur assignation chambre ${assignment.roomId}: ${error.message}`);
      }
    }

    // Mettre à jour les statistiques des hôtels
    const hotelIds = [...new Set(assignments.map(a => a.hotelId))];
    for (const hotelId of hotelIds) {
      const hotel = await Hotel.findById(hotelId);
      if (hotel) {
        await hotel.updateAssignedClients();
      }
    }

    res.json({
      success: true,
      message: `${assignedCount} clients assignés avec succès`,
      data: {
        assignedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Erreur confirm assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la confirmation des assignations'
    });
  }
});

// POST /api/assignments/individual - Assigner un client manuellement
router.post('/individual', async (req, res) => {
  try {
    const { clientId, hotelId, roomType, roommates = [] } = req.body;

    const client = await Client.findById(clientId);
    const hotel = await Hotel.findById(hotelId);

    if (!client || !hotel) {
      return res.status(404).json({
        success: false,
        message: 'Client ou hôtel non trouvé'
      });
    }

    // Vérifier la disponibilité
    const roomTypeInfo = hotel.roomTypes.find(rt => rt.type === roomType);
    if (!roomTypeInfo) {
      return res.status(400).json({
        success: false,
        message: 'Type de chambre non disponible dans cet hôtel'
      });
    }

    // Générer un ID de chambre unique
    const roomId = `${hotel._id}_${roomType}_${Date.now()}`;

    // Assigner le client
    await client.assignToRoom({
      roomId,
      roomType,
      capacity: roomTypeInfo.capacity,
      roommates
    });

    // Mettre à jour les stats de l'hôtel
    await hotel.updateAssignedClients();

    res.json({
      success: true,
      message: 'Client assigné avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur individual assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation individuelle'
    });
  }
});

// DELETE /api/assignments/:clientId - Désassigner un client
router.delete('/:clientId', async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    const hotelId = client.assignedHotel;
    
    // Désassigner le client
    await client.unassignRoom();

    // Mettre à jour les stats de l'hôtel
    if (hotelId) {
      const hotel = await Hotel.findById(hotelId);
      if (hotel) {
        await hotel.updateAssignedClients();
      }
    }

    res.json({
      success: true,
      message: 'Client désassigné avec succès'
    });
  } catch (error) {
    console.error('Erreur unassign client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la désassignation'
    });
  }
});

// GET /api/assignments/stats/:eventId - Statistiques en temps réel
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    const [totalClients, assignedClients, hotels] = await Promise.all([
      Client.countDocuments({ eventId }),
      Client.countDocuments({ eventId, assignedHotel: { $exists: true } }),
      Hotel.find({ eventId })
    ]);

    const unassignedClients = totalClients - assignedClients;
    const totalRooms = hotels.reduce((sum, hotel) => {
      return sum + hotel.roomTypes.reduce((roomSum, rt) => roomSum + rt.quantity, 0);
    }, 0);

    // Calculer les chambres utilisées (approximation)
    const roomsUsed = await Client.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId), assignedHotel: { $exists: true } } },
      { $group: { _id: '$roomAssignment.roomId' } },
      { $count: 'roomsUsed' }
    ]);

    const occupancyRate = totalRooms > 0 ? Math.round((assignedClients / (totalRooms * 4)) * 100) : 0; // Assuming avg 4 per room

    res.json({
      success: true,
      stats: {
        totalClients,
        assignedClients,
        unassignedClients,
        roomsUsed: roomsUsed[0]?.roomsUsed || 0,
        totalRooms,
        occupancyRate,
        assignmentRate: Math.round((assignedClients / totalClients) * 100)
      }
    });
  } catch (error) {
    console.error('Erreur stats assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des statistiques'
    });
  }
});

// POST /api/assignments/optimize/:eventId - Optimiser les assignations existantes
router.post('/optimize/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Récupérer toutes les assignations actuelles
    const assignedClients = await Client.find({ 
      eventId, 
      assignedHotel: { $exists: true } 
    }).populate('assignedHotel');

    // Grouper par chambre
    const roomGroups = {};
    assignedClients.forEach(client => {
      const roomId = client.roomAssignment?.roomId;
      if (roomId) {
        if (!roomGroups[roomId]) {
          roomGroups[roomId] = [];
        }
        roomGroups[roomId].push(client);
      }
    });

    const optimizations = [];
    let optimizedCount = 0;

    // Identifier les optimisations possibles
    for (const [roomId, clients] of Object.entries(roomGroups)) {
      if (clients.length === 0) continue;
      
      const roomCapacity = clients[0].roomAssignment?.roomCapacity || 4;
      const currentOccupancy = clients.length;
      
      // Si la chambre est sous-utilisée
      if (currentOccupancy < roomCapacity && currentOccupancy < 3) {
        // Chercher des clients compatibles pour combler
        const compatibleClients = await findCompatibleClientsForRoom(eventId, clients, roomCapacity - currentOccupancy);
        
        if (compatibleClients.length > 0) {
          optimizations.push({
            type: 'fill_room',
            roomId,
            currentClients: clients.map(c => ({ id: c._id, name: c.fullName })),
            newClients: compatibleClients.map(c => ({ id: c._id, name: c.fullName })),
            improvement: `+${compatibleClients.length} client(s) dans une chambre sous-utilisée`
          });
        }
      }
    }

    // Chercher les chambres qui peuvent être fusionnées
    const underutilizedRooms = Object.entries(roomGroups).filter(([_, clients]) => clients.length <= 2);
    
    for (let i = 0; i < underutilizedRooms.length - 1; i++) {
      const [roomId1, clients1] = underutilizedRooms[i];
      const [roomId2, clients2] = underutilizedRooms[i + 1];
      
      if (canRoomsBeMerged(clients1, clients2)) {
        optimizations.push({
          type: 'merge_rooms',
          roomId1,
          roomId2,
          clients1: clients1.map(c => ({ id: c._id, name: c.fullName })),
          clients2: clients2.map(c => ({ id: c._id, name: c.fullName })),
          improvement: `Fusion de 2 chambres sous-utilisées = -1 chambre`
        });
      }
    }

    res.json({
      success: true,
      message: `${optimizations.length} optimisation(s) possible(s)`,
      data: {
        currentStats: {
          totalRooms: Object.keys(roomGroups).length,
          averageOccupancy: Math.round(
            Object.values(roomGroups).reduce((sum, clients) => sum + clients.length, 0) / 
            Object.keys(roomGroups).length
          )
        },
        optimizations,
        potentialSavings: {
          roomsFreed: optimizations.filter(o => o.type === 'merge_rooms').length,
          clientsReassigned: optimizations.reduce((sum, o) => 
            sum + (o.newClients?.length || 0) + (o.clients2?.length || 0), 0
          )
        }
      }
    });
  } catch (error) {
    console.error('Erreur optimize assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'optimisation'
    });
  }
});

// POST /api/assignments/bulk-update - Mise à jour en lot
router.post('/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body; // Array of { clientId, hotelId, roomId, etc. }
    
    let successCount = 0;
    const errors = [];

    for (const update of updates) {
      try {
        await Client.findByIdAndUpdate(update.clientId, {
          assignedHotel: update.hotelId,
          roomAssignment: update.roomAssignment,
          status: 'Assigné'
        });
        successCount++;
      } catch (error) {
        errors.push(`Client ${update.clientId}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `${successCount} assignation(s) mise(s) à jour`,
      data: {
        successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Erreur bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour en lot'
    });
  }
});

// Fonction helper pour générer les suggestions
async function generateAssignmentSuggestions(clients, hotels, event) {
  const assignments = [];
  const warnings = [];
  let roomCounter = 1;

  // Algorithme simplifié - à améliorer selon vos besoins
  // Priorité : VIP > Groupes > Solo
  // Règles : Non-mixité sauf VIP/couples

  const clientsByPriority = clients.sort((a, b) => {
    const priorities = { 'VIP': 1, 'Influenceur': 2, 'Staff': 3, 'Groupe': 4, 'Solo': 5 };
    return priorities[a.clientType] - priorities[b.clientType];
  });

  // ... Logique d'assignation détaillée ...

  return {
    totalAssigned: assignments.reduce((sum, a) => sum + a.clients.length, 0),
    roomsUsed: assignments.length,
    mixedRooms: assignments.filter(a => a.isMixed).length,
    occupancyRate: Math.round((assignments.reduce((sum, a) => sum + a.clients.length, 0) / 
                              hotels.reduce((sum, h) => sum + h.totalCapacity, 0)) * 100),
    assignments,
    warnings
  };
}

// Fonctions utilitaires
async function findCompatibleClientsForRoom(eventId, existingClients, neededCount) {
  const roomGender = existingClients[0].gender;
  const isVIPRoom = existingClients.some(c => c.clientType === 'VIP');
  
  return await Client.find({
    eventId,
    assignedHotel: { $exists: false },
    $or: [
      { gender: roomGender },
      { clientType: 'VIP' } // VIP peuvent aller partout
    ]
  }).limit(neededCount);
}

function canRoomsBeMerged(clients1, clients2) {
  const totalClients = clients1.length + clients2.length;
  if (totalClients > 4) return false; // Capacité max
  
  const allClients = [...clients1, ...clients2];
  const genders = [...new Set(allClients.map(c => c.gender))];
  const hasVIP = allClients.some(c => c.clientType === 'VIP');
  
  // Règle de mixité
  if (genders.length > 1 && !hasVIP) return false;
  
  // Même hôtel
  const hotels = [...new Set(allClients.map(c => c.assignedHotel?.toString()))];
  if (hotels.length > 1) return false;
  
  return true;
}

module.exports = router;