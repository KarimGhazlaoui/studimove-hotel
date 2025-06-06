const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Hotel = require('../models/Hotel');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const mongoose = require('mongoose');

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
        errors.push(`Erreur client ${client.firstName} ${client.lastName}: ${error.message}`);
      }
    }

    // Marquer la dernière assignation automatique
    await Assignment.updateMany(
      { eventId: eventId },
      { lastAutoAssignment: new Date() }
    );

    res.json({
      success: true,
      message: `Assignation automatique terminée: ${assignedCount} client(s) assigné(s)`,
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

// Fonction helper pour assigner un groupe
async function assignGroup(members, hotels, eventId, allowMixedGroups, maxClientsPerRoom) {
  const groupSize = members.length;
  const groupName = members[0].groupName;
  
  // Vérifier si le groupe est mixte
  const genders = [...new Set(members.map(m => m.gender))];
  const isMixed = genders.length > 1;
  
  if (isMixed && !allowMixedGroups) {
    // Chercher un hôtel VIP pour groupes mixtes
    const vipHotels = hotels.filter(h => h.category === 'VIP' || h.allowMixedGroups);
    
    for (const hotel of vipHotels) {
      const assignment = await Assignment.findOne({ eventId, hotelId: hotel._id }) ||
        new Assignment({ eventId, hotelId: hotel._id, logicalRooms: [] });
      
      // Calculer la capacité disponible
      const availableCapacity = hotel.totalCapacity - assignment.stats.totalAssigned;
      
      if (availableCapacity >= groupSize) {
        // Créer une chambre logique pour le groupe
        const logicalRoomId = `group_${groupName.replace(/\s+/g, '_')}_${Date.now()}`;
        const logicalRoom = {
          logicalRoomId,
          roomType: 'Mixed',
          bedCount: Math.ceil(groupSize / 2),
          maxCapacity: Math.max(groupSize, maxClientsPerRoom),
          assignedClients: members.map(member => ({
            clientId: member._id,
            assignmentType: 'auto',
            assignedBy: 'system',
            assignedAt: new Date()
          })),
          currentOccupancy: groupSize,
          isFullyOccupied: groupSize >= maxClientsPerRoom
        };
        
        assignment.logicalRooms.push(logicalRoom);
        assignment.updateStats();
        await assignment.save();
        
        // Mettre à jour les clients
        await Client.updateMany(
          { _id: { $in: members.map(m => m._id) } },
          { status: 'Assigné', assignedHotel: hotel._id }
        );
        
        return {
          success: true,
          assignedCount: groupSize,
          assignments: [{
            type: 'group',
            groupName: groupName,
            members: groupSize,
            hotel: hotel.name,
            isMixed: true,
            logicalRoomId: logicalRoomId
          }]
        };
      }
    }
    
    return {
      success: false,
      error: `Groupe mixte "${groupName}" nécessite un hôtel VIP non disponible`
    };
  } else {
    // Groupe non mixte, chercher n'importe quel hôtel avec capacité
    for (const hotel of hotels) {
      const assignment = await Assignment.findOne({ eventId, hotelId: hotel._id }) ||
        new Assignment({ eventId, hotelId: hotel._id, logicalRooms: [] });
      
      const availableCapacity = hotel.totalCapacity - assignment.stats.totalAssigned;
      
      if (availableCapacity >= groupSize) {
        const logicalRoomId = `group_${groupName.replace(/\s+/g, '_')}_${Date.now()}`;
        const roomType = genders[0] === 'Homme' ? 'Groupe_Homme' : 'Groupe_Femme';
        
        const logicalRoom = {
          logicalRoomId,
          roomType,
          bedCount: Math.ceil(groupSize / 2),
          maxCapacity: Math.max(groupSize, maxClientsPerRoom),
          assignedClients: members.map(member => ({
            clientId: member._id,
            assignmentType: 'auto',
            assignedBy: 'system',
            assignedAt: new Date()
          })),
          currentOccupancy: groupSize,
          isFullyOccupied: groupSize >= maxClientsPerRoom
        };
        
        assignment.logicalRooms.push(logicalRoom);
        assignment.updateStats();
        await assignment.save();
        
        await Client.updateMany(
          { _id: { $in: members.map(m => m._id) } },
          { status: 'Assigné', assignedHotel: hotel._id }
        );
        
        return {
          success: true,
          assignedCount: groupSize,
          assignments: [{
            type: 'group',
            groupName: groupName,
            members: groupSize,
            hotel: hotel.name,
            isMixed: false,
            logicalRoomId: logicalRoomId
          }]
        };
      }
    }
    
    return {
      success: false,
      error: `Pas assez de place pour le groupe "${groupName}" (${groupSize} personnes)`
    };
  }
}

// Fonction helper pour assigner un client solo
async function assignSoloClient(client, hotels, eventId, maxClientsPerRoom) {
  const clientRoomType = getRoomTypeForClient(client);
  
  for (const hotel of hotels) {
    let assignment = await Assignment.findOne({ eventId, hotelId: hotel._id });
    
    if (!assignment) {
      assignment = new Assignment({ eventId, hotelId: hotel._id, logicalRooms: [] });
    }
    
    // Chercher une chambre logique compatible avec de la place disponible
    let suitableRoom = assignment.logicalRooms.find(room => 
      room.roomType === clientRoomType && 
      room.assignedClients.length < room.maxCapacity
    );
    
    if (!suitableRoom) {
      // Créer une nouvelle chambre logique
      const logicalRoomId = `solo_${client._id}_${Date.now()}`;
      suitableRoom = {
        logicalRoomId,
        roomType: clientRoomType,
        bedCount: 2,
        maxCapacity: maxClientsPerRoom,
        assignedClients: [],
        currentOccupancy: 0,
        isFullyOccupied: false
      };
      assignment.logicalRooms.push(suitableRoom);
    }
    
    // Vérifier la capacité globale de l'hôtel
    const availableCapacity = hotel.totalCapacity - assignment.stats.totalAssigned;
    
    if (availableCapacity > 0) {
      suitableRoom.assignedClients.push({
        clientId: client._id,
        assignmentType: 'auto',
        assignedBy: 'system',
        assignedAt: new Date()
      });
      
      assignment.updateStats();
      await assignment.save();
      
      client.status = 'Assigné';
      client.assignedHotel = hotel._id;
      await client.save();
      
      return {
        success: true,
        assignment: {
          type: 'solo',
          client: `${client.firstName} ${client.lastName}`,
          hotel: hotel.name,
          logicalRoomId: suitableRoom.logicalRoomId
        }
      };
    }
  }
  
  return {
    success: false,
    error: `Pas de place disponible pour ${client.firstName} ${client.lastName}`
  };
}

// Fonction helper pour déterminer le type de chambre
function getRoomTypeForClient(client) {
  if (client.clientType === 'VIP') return 'VIP';
  if (client.clientType === 'Influenceur') return 'Influenceur';
  if (client.clientType === 'Staff') {
    return client.gender === 'Homme' ? 'Staff_Homme' : 'Staff_Femme';
  }
  return client.gender === 'Homme' ? 'Groupe_Homme' : 'Groupe_Femme';
}

// DELETE /api/assignments/remove-client - Retirer un client d'une assignation
router.delete('/remove-client', async (req, res) => {
  try {
    const { clientId, eventId } = req.body;

    // Trouver l'assignation contenant ce client
    const assignment = await Assignment.findOne({
      eventId: eventId,
      'logicalRooms.assignedClients.clientId': clientId
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé dans les assignations'
      });
    }

    // Trouver et supprimer le client de la chambre logique
    let clientRemoved = false;
    let roomToRemove = null;

    assignment.logicalRooms.forEach((room, roomIndex) => {
      const clientIndex = room.assignedClients.findIndex(
        ac => ac.clientId.toString() === clientId
      );
      
      if (clientIndex !== -1) {
        room.assignedClients.splice(clientIndex, 1);
        clientRemoved = true;
        
        // Si la chambre est vide, la marquer pour suppression
        if (room.assignedClients.length === 0) {
          roomToRemove = roomIndex;
        }
      }
    });

    if (!clientRemoved) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé dans cette assignation'
      });
    }

    // Supprimer la chambre vide si nécessaire
    if (roomToRemove !== null) {
      assignment.logicalRooms.splice(roomToRemove, 1);
    }

    // Mettre à jour les statistiques
    assignment.updateStats();
    await assignment.save();

    // Mettre à jour le statut du client
    const client = await Client.findById(clientId);
    if (client) {
      client.status = 'En attente';
      client.assignedHotel = null;
      await client.save();
    }

    await assignment.populate('hotelId', 'name');

    res.json({
      success: true,
      message: 'Client retiré de l\'assignation avec succès',
      data: {
        client: client,
        hotel: assignment.hotelId.name,
        assignment: assignment
      }
    });

  } catch (error) {
    console.error('Erreur suppression assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression',
      error: error.message
    });
  }
});

// GET /api/assignments/stats/:eventId - Statistiques d'assignation
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const [clients, assignments, hotels] = await Promise.all([
      Client.find({ eventId }),
      Assignment.find({ eventId }).populate('hotelId', 'name category'),
      Hotel.find({ eventId })
    ]);

    // Statistiques globales
    const totalAssigned = assignments.reduce((sum, a) => sum + a.stats.totalAssigned, 0);
    const totalCapacity = assignments.reduce((sum, a) => sum + a.stats.totalCapacity, 0);

    const stats = {
      clients: {
        total: clients.length,
        assigned: clients.filter(c => c.status === 'Assigné').length,
        unassigned: clients.filter(c => c.status !== 'Assigné').length,
        byType: clients.reduce((acc, c) => {
          acc[c.clientType] = (acc[c.clientType] || 0) + 1;
          return acc;
        }, {}),
        byGender: clients.reduce((acc, c) => {
          acc[c.gender] = (acc[c.gender] || 0) + 1;
          return acc;
        }, {}),
        groups: {
          total: clients.filter(c => c.clientType === 'Groupe').length,
          mixed: await getMixedGroupsCount(clients)
        }
      },
      hotels: {
        total: hotels.length,
        totalCapacity: hotels.reduce((sum, h) => sum + h.totalCapacity, 0),
        totalAssigned: totalAssigned,
        byCategory: hotels.reduce((acc, h) => {
          if (!acc[h.category]) {
            acc[h.category] = { count: 0, capacity: 0, assigned: 0 };
          }
          acc[h.category].count++;
          acc[h.category].capacity += h.totalCapacity;
          return acc;
        }, {}),
        occupancy: assignments.map(a => ({
          name: a.hotelId.name,
          category: a.hotelId.category,
          capacity: a.stats.totalCapacity,
          assigned: a.stats.totalAssigned,
          rate: a.stats.occupancyRate
        }))
      },
      logicalRooms: {
        total: assignments.reduce((sum, a) => sum + a.stats.totalLogicalRooms, 0),
        byType: assignments.reduce((acc, a) => {
          a.logicalRooms.forEach(room => {
            acc[room.roomType] = (acc[room.roomType] || 0) + 1;
          });
          return acc;
        }, {}),
        fullyOccupied: assignments.reduce((sum, a) => 
          sum + a.logicalRooms.filter(r => r.isFullyOccupied).length, 0)
      },
      summary: {
        assignmentRate: clients.length > 0 ? 
          (clients.filter(c => c.status === 'Assigné').length / clients.length * 100).toFixed(1) : 0,
        occupancyRate: totalCapacity > 0 ? (totalAssigned / totalCapacity * 100).toFixed(1) : 0,
        availableSpots: totalCapacity - totalAssigned,
        activeAssignments: assignments.filter(a => a.status === 'Active').length
      }
    };

    // Enrichir les stats par catégorie d'hôtel avec les assignations
    for (const assignment of assignments) {
      const category = assignment.hotelId.category;
      if (stats.hotels.byCategory[category]) {
        stats.hotels.byCategory[category].assigned += assignment.stats.totalAssigned;
      }
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur stats assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Fonction helper pour compter les groupes mixtes
async function getMixedGroupsCount(clients) {
  const groups = {};
  clients.filter(c => c.groupName).forEach(client => {
    if (!groups[client.groupName]) {
      groups[client.groupName] = new Set();
    }
    groups[client.groupName].add(client.gender);
  });
  
  return Object.values(groups).filter(genders => genders.size > 1).length;
}

// PUT /api/assignments/move-client - Déplacer un client entre chambres/hôtels
router.put('/move-client', async (req, res) => {
  try {
    const { 
      clientId, 
      eventId, 
      newHotelId, 
      newLogicalRoomId, 
      createNewRoom = false,
      roomType = 'Groupe_Mixte',
      maxCapacity = 4 
    } = req.body;

    // Trouver l'assignation actuelle
    const currentAssignment = await Assignment.findOne({
      eventId: eventId,
      'logicalRooms.assignedClients.clientId': clientId
    });

    if (!currentAssignment) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé dans les assignations actuelles'
      });
    }

    // Récupérer les informations du client
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Supprimer le client de l'assignation actuelle
    let currentRoom = null;
    let currentRoomIndex = -1;

    currentAssignment.logicalRooms.forEach((room, index) => {
      const clientIndex = room.assignedClients.findIndex(
        ac => ac.clientId.toString() === clientId
      );
      if (clientIndex !== -1) {
        currentRoom = room;
        currentRoomIndex = index;
        room.assignedClients.splice(clientIndex, 1);
      }
    });

    // Si la chambre actuelle est vide, la supprimer
    if (currentRoom && currentRoom.assignedClients.length === 0) {
      currentAssignment.logicalRooms.splice(currentRoomIndex, 1);
    }

    // Trouver ou créer la nouvelle assignation
    let newAssignment = await Assignment.findOne({ 
      eventId: eventId, 
      hotelId: newHotelId 
    });

    if (!newAssignment) {
      newAssignment = new Assignment({
        eventId,
        hotelId: newHotelId,
        logicalRooms: [],
        status: 'Active'
      });
    }

    // Gérer la nouvelle chambre logique
    let targetRoom = null;

    if (createNewRoom || !newLogicalRoomId) {
      // Créer une nouvelle chambre
      const newRoomId = `moved_${clientId}_${Date.now()}`;
      targetRoom = {
        logicalRoomId: newRoomId,
        roomType: roomType,
        bedCount: 2,
        maxCapacity: maxCapacity,
        assignedClients: [],
        currentOccupancy: 0,
        isFullyOccupied: false
      };
      newAssignment.logicalRooms.push(targetRoom);
    } else {
      // Utiliser une chambre existante
      targetRoom = newAssignment.logicalRooms.find(
        room => room.logicalRoomId === newLogicalRoomId
      );
      
      if (!targetRoom) {
        return res.status(404).json({
          success: false,
          message: 'Chambre logique de destination non trouvée'
        });
      }

      // Vérifier la capacité
      if (targetRoom.assignedClients.length >= targetRoom.maxCapacity) {
        return res.status(400).json({
          success: false,
          message: 'La chambre de destination est pleine'
        });
      }
    }

    // Ajouter le client à la nouvelle chambre
    targetRoom.assignedClients.push({
      clientId: clientId,
      assignmentType: 'manual',
      assignedBy: req.user?.id || 'manual',
      assignedAt: new Date()
    });

    // Mettre à jour les statistiques des deux assignations
    currentAssignment.updateStats();
    newAssignment.updateStats();

    // Sauvegarder les assignations
    await Promise.all([
      currentAssignment.save(),
      newAssignment.save()
    ]);

    // Mettre à jour le client
    client.assignedHotel = newHotelId;
    await client.save();

    // Peupler les données pour la réponse
    await Promise.all([
      currentAssignment.populate('hotelId', 'name'),
      newAssignment.populate('hotelId', 'name')
    ]);

    res.json({
      success: true,
      message: `${client.firstName} ${client.lastName} déplacé(e) vers ${newAssignment.hotelId.name}`,
      data: {
        client: client,
        from: {
          hotel: currentAssignment.hotelId.name,
          roomId: currentRoom?.logicalRoomId
        },
        to: {
          hotel: newAssignment.hotelId.name,
          roomId: targetRoom.logicalRoomId
        }
      }
    });

  } catch (error) {
    console.error('Erreur déplacement client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du déplacement',
      error: error.message
    });
  }
});

// PUT /api/assignments/room/:assignmentId/:logicalRoomId - Mettre à jour une chambre logique
router.put('/room/:assignmentId/:logicalRoomId', async (req, res) => {
  try {
    const { assignmentId, logicalRoomId } = req.params;
    const { realRoomNumber, bedCount, maxCapacity, notes } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    const logicalRoom = assignment.logicalRooms.find(
      room => room.logicalRoomId === logicalRoomId
    );

    if (!logicalRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chambre logique non trouvée'
      });
    }

    // Mettre à jour les champs
    if (realRoomNumber !== undefined) {
      logicalRoom.realRoomNumber = realRoomNumber;
    }
    if (bedCount !== undefined) {
      logicalRoom.bedCount = Math.max(1, parseInt(bedCount));
    }
    if (maxCapacity !== undefined) {
      const newCapacity = Math.max(1, parseInt(maxCapacity));
      
      // Vérifier que la nouvelle capacité peut accueillir les clients actuels
      if (newCapacity < logicalRoom.assignedClients.length) {
        return res.status(400).json({
          success: false,
          message: `Impossible de réduire la capacité à ${newCapacity}. ${logicalRoom.assignedClients.length} client(s) actuellement assigné(s).`
        });
      }
      
      logicalRoom.maxCapacity = newCapacity;
    }

    // Mettre à jour les statistiques
    assignment.updateStats();
    await assignment.save();

    await assignment.populate('hotelId', 'name address');
    await assignment.populate('logicalRooms.assignedClients.clientId', 'firstName lastName');

    res.json({
      success: true,
      message: 'Chambre logique mise à jour avec succès',
      data: {
        assignment: assignment,
        updatedRoom: logicalRoom
      }
    });

  } catch (error) {
    console.error('Erreur mise à jour chambre:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour',
      error: error.message
    });
  }
});

// DELETE /api/assignments/event/:eventId - Supprimer toutes les assignations d'un événement
router.delete('/event/:eventId', async (req, res) => {
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

    // Supprimer toutes les assignations
    const deleteResult = await Assignment.deleteMany({ eventId: eventId });

    // Remettre tous les clients en attente
    const updateResult = await Client.updateMany(
      { eventId: eventId, status: 'Assigné' },
      { 
        status: 'En attente', 
        assignedHotel: null 
      }
    );

    console.log(`🗑️ Assignations supprimées pour l'événement: ${event.name}`);
    console.log(`✅ ${deleteResult.deletedCount} assignations supprimées`);
    console.log(`✅ ${updateResult.modifiedCount} clients remis en attente`);

    res.json({
      success: true,
      message: `Toutes les assignations de l'événement "${event.name}" ont été supprimées`,
      data: {
        event: event.name,
        deletedAssignments: deleteResult.deletedCount,
        updatedClients: updateResult.modifiedCount
      }
    });

  } catch (error) {
    console.error('❌ Erreur suppression assignations événement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression des assignations',
      error: error.message
    });
  }
});

// PUT /api/assignments/status/:assignmentId - Changer le statut d'une assignation
router.put('/status/:assignmentId', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['Draft', 'Active', 'OnSite', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}`
      });
    }

    const assignment = await Assignment.findById(assignmentId)
      .populate('hotelId', 'name')
      .populate('eventId', 'name');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    const oldStatus = assignment.status;
    assignment.status = status;
    
    if (notes !== undefined) {
      assignment.notes = notes;
    }

    await assignment.save();

    res.json({
      success: true,
      message: `Statut de l'assignation changé de "${oldStatus}" à "${status}"`,
      data: {
        assignment: assignment,
        hotel: assignment.hotelId.name,
        event: assignment.eventId.name,
        statusChange: {
          from: oldStatus,
          to: status
        }
      }
    });

  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du changement de statut',
      error: error.message
    });
  }
});

// GET /api/assignments/export/:eventId - Exporter les assignations
router.get('/export/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { format = 'json' } = req.query;

    const assignments = await Assignment.find({ eventId })
      .populate('hotelId', 'name address category contact')
      .populate('eventId', 'name country city dates')
      .populate('logicalRooms.assignedClients.clientId', 'firstName lastName phone email gender clientType groupName');

    // Transformer les données pour l'export
    const exportData = {
      event: assignments[0]?.eventId || null,
      exportDate: new Date().toISOString(),
      totalAssignments: assignments.length,
      data: assignments.map(assignment => ({
        hotel: {
          id: assignment.hotelId._id,
          name: assignment.hotelId.name,
          address: assignment.hotelId.address,
          category: assignment.hotelId.category,
          contact: assignment.hotelId.contact
        },
        stats: assignment.stats,
        status: assignment.status,
        rooms: assignment.logicalRooms.map(room => ({
          logicalRoomId: room.logicalRoomId,
          realRoomNumber: room.realRoomNumber,
          roomType: room.roomType,
          capacity: room.maxCapacity,
          occupancy: room.currentOccupancy,
          clients: room.assignedClients.map(ac => ({
            id: ac.clientId._id,
            name: `${ac.clientId.firstName} ${ac.clientId.lastName}`,
            phone: ac.clientId.phone,
            email: ac.clientId.email,
            gender: ac.clientId.gender,
            type: ac.clientId.clientType,
            group: ac.clientId.groupName,
            assignedAt: ac.assignedAt,
            assignmentType: ac.assignmentType
          }))
        }))
      }))
    };

    if (format === 'csv') {
      // TODO: Implémenter l'export CSV si nécessaire
      return res.status(501).json({
        success: false,
        message: 'Export CSV pas encore implémenté'
      });
    }

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Erreur export assignations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'export',
      error: error.message
    });
  }
});

module.exports = router;
