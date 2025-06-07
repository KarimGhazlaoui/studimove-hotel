const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Hotel = require('../models/Hotel');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const mongoose = require('mongoose');

// GET /api/assignments/available-hotels/:eventId - VERSION SIMPLIFIÉE POUR TEST
router.get('/available-hotels/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    console.log(`🔍 Recherche hôtels disponibles pour événement: ${eventId}`);
    
    // Vérifier que l'événement existe
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // 🆕 TEMPORAIRE: Retourner TOUS les hôtels actifs (sans vérifier assignments)
    const allHotels = await Hotel.find({
      status: 'Active'
    }).sort({ name: 1 });

    console.log(`📋 ${allHotels.length} hôtels totaux trouvés`);

    // 🆕 SIMPLIFICATION: Pas de vérification d'assignments pour l'instant
    const hotelsWithStats = allHotels.map(hotel => ({
      _id: hotel._id,
      name: hotel.name,
      address: hotel.address,
      city: hotel.address?.city,
      country: hotel.address?.country,
      category: hotel.category,
      totalCapacity: hotel.totalCapacity || 0,
      occupancy: 0,
      availableRooms: hotel.totalCapacity || 0,
      occupancyRate: 0,
      isAvailable: true,
      contact: hotel.contact
    }));

    res.json({
      success: true,
      count: hotelsWithStats.length,
      data: hotelsWithStats,
      event: {
        _id: event._id,
        name: event.name,
        city: event.city,
        country: event.country
      }
    });
  } catch (error) {
    console.error('❌ Erreur GET available-hotels:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});


// GET /api/assignments/event/:eventId - Récupérer les assignations d'un événement
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Vérifier que l'événement existe
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Récupérer toutes les assignations de l'événement avec les données peuplées
    const assignments = await Assignment.find({ eventId })
      .populate('hotelId', 'name address category totalCapacity')
      .populate('logicalRooms.assignedClients.clientId', 'firstName lastName phone gender clientType groupName');

    // Transformer les données pour le format attendu par le frontend
    const formattedAssignments = assignments.map(assignment => ({
      assignmentId: assignment._id,
      hotel: assignment.hotelId,
      logicalRooms: assignment.logicalRooms.map(room => ({
        logicalRoomId: room.logicalRoomId,
        roomType: room.roomType,
        bedCount: room.bedCount,
        maxCapacity: room.maxCapacity,
        currentOccupancy: room.currentOccupancy,
        isFullyOccupied: room.isFullyOccupied,
        realRoomNumber: room.realRoomNumber,
        assignedClients: room.assignedClients.map(ac => ({
          client: ac.clientId,
          assignmentType: ac.assignmentType,
          assignedAt: ac.assignedAt,
          assignedBy: ac.assignedBy
        }))
      })),
      stats: assignment.stats,
      status: assignment.status,
      lastAutoAssignment: assignment.lastAutoAssignment
    }));

    res.json({
      success: true,
      data: formattedAssignments,
      eventInfo: {
        id: event._id,
        name: event.name,
        totalParticipants: event.participantsCount
      }
    });
  } catch (error) {
    console.error('Erreur GET assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des assignations'
    });
  }
});

// POST /api/assignments/manual-assign - Assignation manuelle
router.post('/manual-assign', async (req, res) => {
  try {
    const { 
      clientId, 
      hotelId, 
      eventId, 
      logicalRoomId, 
      roomType = 'Groupe_Mixte',
      bedCount = 2,
      maxCapacity = 4
    } = req.body;

    // Validations
    const [client, hotel, event] = await Promise.all([
      Client.findById(clientId),
      Hotel.findById(hotelId),
      Event.findById(eventId)
    ]);

    if (!client || !hotel || !event) {
      return res.status(404).json({
        success: false,
        message: 'Client, hôtel ou événement non trouvé'
      });
    }

    // Vérifier que le client appartient à cet événement
    if (client.eventId.toString() !== eventId) {
      return res.status(400).json({
        success: false,
        message: 'Le client ne fait pas partie de cet événement'
      });
    }

    // Vérifier si le client est déjà assigné
    const existingAssignment = await Assignment.findOne({
      eventId: eventId,
      'logicalRooms.assignedClients.clientId': clientId
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Le client est déjà assigné'
      });
    }

    // Chercher ou créer l'assignation pour cet hôtel/événement
    let assignment = await Assignment.findOne({ eventId, hotelId });
    
    if (!assignment) {
      assignment = new Assignment({
        eventId,
        hotelId,
        logicalRooms: [],
        status: 'Active'
      });
    }

    // Générer un ID de chambre logique si non fourni
    const finalLogicalRoomId = logicalRoomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // Trouver ou créer la chambre logique
    let logicalRoom = assignment.logicalRooms.find(room => 
      room.logicalRoomId === finalLogicalRoomId
    );

    if (!logicalRoom) {
      // Déterminer le type de chambre basé sur le client
      let finalRoomType = roomType;
      if (client.clientType === 'VIP') {
        finalRoomType = 'VIP';
      } else if (client.clientType === 'Influenceur') {
        finalRoomType = 'Influenceur';
      } else if (client.clientType === 'Staff') {
        finalRoomType = client.gender === 'Homme' ? 'Staff_Homme' : 'Staff_Femme';
      } else if (client.groupName) {
        // Vérifier si le groupe est mixte
        const groupMembers = await Client.find({ 
          eventId: eventId, 
          groupName: client.groupName 
        });
        const genders = [...new Set(groupMembers.map(m => m.gender))];
        finalRoomType = genders.length > 1 ? 'Mixed' : 
          (client.gender === 'Homme' ? 'Groupe_Homme' : 'Groupe_Femme');
      }

      logicalRoom = {
        logicalRoomId: finalLogicalRoomId,
        roomType: finalRoomType,
        bedCount: bedCount,
        maxCapacity: maxCapacity,
        assignedClients: [],
        currentOccupancy: 0,
        isFullyOccupied: false
      };
      assignment.logicalRooms.push(logicalRoom);
    }

    // Vérifier la capacité
    if (logicalRoom.assignedClients.length >= logicalRoom.maxCapacity) {
      return res.status(400).json({
        success: false,
        message: `La chambre ${logicalRoom.logicalRoomId} a atteint sa capacité maximale (${logicalRoom.maxCapacity})`
      });
    }

    // Ajouter le client à la chambre logique
    logicalRoom.assignedClients.push({
      clientId: clientId,
      assignmentType: 'manual',
      assignedBy: req.user?.id || 'manual',
      assignedAt: new Date()
    });

    // Mettre à jour les statistiques
    assignment.updateStats();
    await assignment.save();

    // Mettre à jour le statut du client
    client.status = 'Assigné';
    client.assignedHotel = hotelId;
    await client.save();

    // Peupler les données pour la réponse
    await assignment.populate('hotelId', 'name address');
    await assignment.populate('logicalRooms.assignedClients.clientId', 'firstName lastName');

    res.json({
      success: true,
      message: `${client.firstName} ${client.lastName} assigné(e) à la chambre ${logicalRoom.logicalRoomId}`,
      data: {
        assignment: assignment,
        logicalRoom: logicalRoom,
        client: client
      }
    });

  } catch (error) {
    console.error('Erreur assignation manuelle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation',
      error: error.message
    });
  }
});

// POST /api/assignments/auto-assign/:eventId - Assignation automatique
router.post('/auto-assign/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      prioritizeVIP = true,
      respectGroupsIntegrity = true,
      allowMixedGroups = false,
      maxClientsPerRoom = 4
    } = req.body;

    // Récupérer les clients non assignés
    const unassignedClients = await Client.find({
      eventId: eventId,
      status: { $ne: 'Assigné' }
    });

    if (unassignedClients.length === 0) {
      return res.json({
        success: true,
        message: 'Tous les clients sont déjà assignés',
        data: { assignedCount: 0, errors: [] }
      });
    }

    // Récupérer les hôtels disponibles
    const hotels = await Hotel.find({ eventId: eventId });
    
    let assignedCount = 0;
    const errors = [];
    const assignments = [];

    // Trier les clients par priorité
    const sortedClients = unassignedClients.sort((a, b) => {
      if (prioritizeVIP) {
        const priorityOrder = { 'VIP': 1, 'Influenceur': 2, 'Staff': 3, 'Groupe': 4, 'Solo': 5 };
        return (priorityOrder[a.clientType] || 999) - (priorityOrder[b.clientType] || 999);
      }
      return 0;
    });

    // Traiter les groupes en premier si respectGroupsIntegrity
    if (respectGroupsIntegrity) {
      const groups = {};
      sortedClients.forEach(client => {
        if (client.groupName) {
          if (!groups[client.groupName]) {
            groups[client.groupName] = [];
          }
          groups[client.groupName].push(client);
        }
      });

      // Assigner les groupes
      for (const [groupName, members] of Object.entries(groups)) {
        try {
          const result = await assignGroup(members, hotels, eventId, allowMixedGroups, maxClientsPerRoom);
          if (result.success) {
            assignedCount += result.assignedCount;
            assignments.push(...result.assignments);
          } else {
            errors.push(result.error);
          }
        } catch (error) {
          errors.push(`Erreur groupe "${groupName}": ${error.message}`);
        }
      }
    }

    // Assigner les clients solo restants
    const remainingClients = sortedClients.filter(client => 
      !client.groupName && client.status !== 'Assigné'
    );

    for (const client of remainingClients) {
      try {
        const result = await assignSoloClient(client, hotels, eventId, maxClientsPerRoom);
        if (result.success) {
          assignedCount++;
          assignments.push(result.assignment);
        } else {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push(`Erreur client "${client.firstName} ${client.lastName}": ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Assignation automatique terminée: ${assignedCount} clients assignés`,
      data: {
        assignedCount,
        totalClients: unassignedClients.length,
        assignments,
        errors
      }
    });

  } catch (error) {
    console.error('Erreur assignation automatique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation automatique',
      error: error.message
    });
  }
});

// DELETE /api/assignments/unassign/:clientId - Désassigner un client
router.delete('/unassign/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Trouver l'assignation contenant ce client
    const assignment = await Assignment.findOne({
      'logicalRooms.assignedClients.clientId': clientId
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Aucune assignation trouvée pour ce client'
      });
    }

    // Retirer le client de toutes les chambres logiques
    let removed = false;
    assignment.logicalRooms.forEach(room => {
      const initialLength = room.assignedClients.length;
      room.assignedClients = room.assignedClients.filter(
        ac => ac.clientId.toString() !== clientId
      );
      if (room.assignedClients.length < initialLength) {
        removed = true;
        room.currentOccupancy = room.assignedClients.length;
        room.isFullyOccupied = room.assignedClients.length >= room.maxCapacity;
      }
    });

    // Supprimer les chambres vides
    assignment.logicalRooms = assignment.logicalRooms.filter(
      room => room.assignedClients.length > 0
    );

    // Mettre à jour les statistiques
    assignment.updateStats();
    await assignment.save();

    // Mettre à jour le statut du client
    client.status = 'En attente';
    client.assignedHotel = null;
    await client.save();

    res.json({
      success: true,
      message: `${client.firstName} ${client.lastName} a été désassigné(e)`,
      data: { client, removed }
    });

  } catch (error) {
    console.error('Erreur désassignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la désassignation',
      error: error.message
    });
  }
});

// GET /api/assignments/stats/:eventId - Statistiques d'assignation
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    const [totalClients, assignedClients, assignments] = await Promise.all([
      Client.countDocuments({ eventId }),
      Client.countDocuments({ eventId, status: 'Assigné' }),
      Assignment.find({ eventId }).populate('hotelId', 'name')
    ]);

    // Statistiques par hôtel
    const hotelStats = assignments.map(assignment => ({
      hotel: assignment.hotelId.name,
      totalCapacity: assignment.stats.totalCapacity,
      assigned: assignment.stats.totalAssigned,
      occupancyRate: assignment.stats.occupancyRate,
      availableRooms: assignment.stats.totalCapacity - assignment.stats.totalAssigned,
      logicalRoomsCount: assignment.logicalRooms.length
    }));

    // Statistiques par type de client
    const clientTypeStats = await Client.aggregate([
      { $match: { eventId: mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: '$clientType',
          total: { $sum: 1 },
          assigned: {
            $sum: { $cond: [{ $eq: ['$status', 'Assigné'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        event: event.name,
        overview: {
          totalClients,
          assignedClients,
          unassignedClients: totalClients - assignedClients,
          assignmentRate: totalClients > 0 ? Math.round((assignedClients / totalClients) * 100) : 0
        },
        hotelStats,
        clientTypeStats
      }
    });

  } catch (error) {
    console.error('Erreur statistiques assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// Fonctions utilitaires pour l'assignation automatique

async function assignGroup(members, hotels, eventId, allowMixedGroups, maxClientsPerRoom) {
  try {
    const groupName = members[0].groupName;
    const genders = [...new Set(members.map(m => m.gender))];
    const isMixed = genders.length > 1;

    // Déterminer le type de chambre nécessaire
    let roomType = 'Groupe';
    if (isMixed && !allowMixedGroups) {
      return {
        success: false,
        error: `Groupe "${groupName}" est mixte mais les groupes mixtes ne sont pas autorisés`
      };
    }

    if (isMixed) {
      roomType = 'Mixed';
    } else {
      roomType = genders[0] === 'Homme' ? 'Groupe_Homme' : 'Groupe_Femme';
    }

    // Chercher un hôtel avec suffisamment de place
    for (const hotel of hotels) {
      let assignment = await Assignment.findOne({ eventId, hotelId: hotel._id });
      
      if (!assignment) {
        assignment = new Assignment({
          eventId,
          hotelId: hotel._id,
          logicalRooms: [],
          status: 'Active'
        });
      }

      // Calculer l'espace disponible
      const currentOccupancy = assignment.stats.totalAssigned || 0;
      const totalCapacity = assignment.totalCapacity || hotel.totalCapacity || 0;
      const availableSpace = totalCapacity - currentOccupancy;

      if (availableSpace >= members.length) {
        // Créer une chambre logique pour le groupe
        const logicalRoomId = `group_${groupName.replace(/\s+/g, '_')}_${Date.now()}`;
        const logicalRoom = {
          logicalRoomId,
          roomType,
          bedCount: Math.ceil(members.length / 2),
          maxCapacity: Math.min(members.length, maxClientsPerRoom),
          assignedClients: members.map(member => ({
            clientId: member._id,
            assignmentType: 'auto',
            assignedBy: 'system',
            assignedAt: new Date()
          })),
          currentOccupancy: members.length,
          isFullyOccupied: true
        };

        assignment.logicalRooms.push(logicalRoom);
        assignment.updateStats();
        await assignment.save();

        // Mettre à jour les clients
        await Promise.all(members.map(member => {
          member.status = 'Assigné';
          member.assignedHotel = hotel._id;
          return member.save();
        }));

        return {
          success: true,
          assignedCount: members.length,
          assignments: [{
            hotel: hotel.name,
            logicalRoom: logicalRoomId,
            clients: members.map(m => `${m.firstName} ${m.lastName}`)
          }]
        };
      }
    }

    return {
      success: false,
      error: `Pas assez d'espace disponible pour le groupe "${groupName}" (${members.length} personnes)`
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function assignSoloClient(client, hotels, eventId, maxClientsPerRoom) {
  try {
    // Déterminer le type de chambre approprié
    let roomType = 'Solo';
    if (client.clientType === 'VIP') {
      roomType = 'VIP';
    } else if (client.clientType === 'Influenceur') {
      roomType = 'Influenceur';
    } else if (client.clientType === 'Staff') {
      roomType = client.gender === 'Homme' ? 'Staff_Homme' : 'Staff_Femme';
    } else {
      roomType = client.gender === 'Homme' ? 'Solo_Homme' : 'Solo_Femme';
    }

    // Chercher une chambre existante compatible
    for (const hotel of hotels) {
      let assignment = await Assignment.findOne({ eventId, hotelId: hotel._id });
      
      if (!assignment) {
        assignment = new Assignment({
          eventId,
          hotelId: hotel._id,
          logicalRooms: [],
          status: 'Active'
        });
      }

      // Chercher une chambre logique existante compatible
      const compatibleRoom = assignment.logicalRooms.find(room => 
        room.roomType === roomType && 
        room.assignedClients.length < room.maxCapacity &&
        !room.isFullyOccupied
      );

      if (compatibleRoom) {
        // Ajouter le client à cette chambre
        compatibleRoom.assignedClients.push({
          clientId: client._id,
          assignmentType: 'auto',
          assignedBy: 'system',
          assignedAt: new Date()
        });
        compatibleRoom.currentOccupancy = compatibleRoom.assignedClients.length;
        compatibleRoom.isFullyOccupied = compatibleRoom.assignedClients.length >= compatibleRoom.maxCapacity;

        assignment.updateStats();
        await assignment.save();

        client.status = 'Assigné';
        client.assignedHotel = hotel._id;
        await client.save();

        return {
          success: true,
          assignment: {
            hotel: hotel.name,
            logicalRoom: compatibleRoom.logicalRoomId,
            client: `${client.firstName} ${client.lastName}`
          }
        };
      }

      // Sinon, créer une nouvelle chambre si l'hôtel a de l'espace
      const currentOccupancy = assignment.stats.totalAssigned || 0;
      const totalCapacity = assignment.totalCapacity || hotel.totalCapacity || 0;
      const availableSpace = totalCapacity - currentOccupancy;

      if (availableSpace >= 1) {
        const logicalRoomId = `solo_${client.firstName}_${client.lastName}_${Date.now()}`.replace(/\s+/g, '_');
        const newRoom = {
          logicalRoomId,
          roomType,
          bedCount: 1,
          maxCapacity: Math.min(maxClientsPerRoom, 2),
          assignedClients: [{
            clientId: client._id,
            assignmentType: 'auto',
            assignedBy: 'system',
            assignedAt: new Date()
          }],
          currentOccupancy: 1,
          isFullyOccupied: false
        };

        assignment.logicalRooms.push(newRoom);
        assignment.updateStats();
        await assignment.save();

        client.status = 'Assigné';
        client.assignedHotel = hotel._id;
        await client.save();

        return {
          success: true,
          assignment: {
            hotel: hotel.name,
            logicalRoom: logicalRoomId,
            client: `${client.firstName} ${client.lastName}`
          }
        };
      }
    }

    return {
      success: false,
      error: `Pas d'espace disponible pour ${client.firstName} ${client.lastName}`
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// POST /api/assignments - Créer une assignation d'hôtel à un événement
router.post('/', async (req, res) => {
  try {
    const { eventId, hotelId, logicalRooms, notes } = req.body;

    // Vérifications
    const [event, hotel] = await Promise.all([
      Event.findById(eventId),
      Hotel.findById(hotelId)
    ]);

    if (!event || !hotel) {
      return res.status(404).json({
        success: false,
        message: 'Événement ou hôtel non trouvé'
      });
    }

    // Vérifier si l'assignation existe déjà
    const existingAssignment = await Assignment.findOne({ eventId, hotelId });
    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Cet hôtel est déjà assigné à cet événement'
      });
    }

    // Créer l'assignation
    const assignment = new Assignment({
      eventId,
      hotelId,
      logicalRooms: logicalRooms || [],
      notes: notes || '',
      status: 'Active'
    });

    await assignment.save();
    await assignment.populate('hotelId', 'name address');

    res.status(201).json({
      success: true,
      message: `Hôtel "${hotel.name}" assigné à l'événement "${event.name}"`,
      data: assignment
    });
  } catch (error) {
    console.error('Erreur création assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'assignation',
      error: error.message
    });
  }
});

// DELETE /api/assignments/:id - Supprimer une assignation complète
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await Assignment.findById(id).populate('hotelId', 'name');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    // Vérifier s'il y a des clients assignés
    const hasClients = assignment.logicalRooms.some(room => 
      room.assignedClients && room.assignedClients.length > 0
    );

    if (hasClients) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer cette assignation : des clients y sont assignés. Désassignez-les d\'abord.'
      });
    }

    await Assignment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: `Assignation de l'hôtel "${assignment.hotelId.name}" supprimée avec succès`
    });
  } catch (error) {
    console.error('Erreur suppression assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'assignation',
      error: error.message
    });
  }
});


module.exports = router;
