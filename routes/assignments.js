const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const Client = require('../models/Client');
const Event = require('../models/Event');
const Hotel = require('../models/Hotel');
const mongoose = require('mongoose');

// 🎯 GET /api/assignments/event/:eventId - Récupérer les assignations d'un événement
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    const assignments = await Assignment.find({ eventId })
      .populate('hotelId', 'name address rating')
      .populate('logicalRooms.assignedClients.clientId', 'firstName lastName gender clientType groupName phone')
      .sort({ 'hotelId.name': 1 });

    // Calculer les statistiques globales
    const globalStats = assignments.reduce((acc, assignment) => {
      acc.totalHotels += 1;
      acc.totalCapacity += assignment.stats.totalCapacity;
      acc.totalAssigned += assignment.stats.totalAssigned;
      return acc;
    }, { totalHotels: 0, totalCapacity: 0, totalAssigned: 0 });

    globalStats.availableCapacity = globalStats.totalCapacity - globalStats.totalAssigned;
    globalStats.occupancyRate = globalStats.totalCapacity > 0 ? 
      Math.round((globalStats.totalAssigned / globalStats.totalCapacity) * 100) : 0;

    res.json({
      success: true,
      data: {
        event: { _id: event._id, name: event.name, city: event.city, country: event.country },
        assignments,
        stats: globalStats
      }
    });
  } catch (error) {
    console.error('Erreur GET assignments event:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des assignations'
    });
  }
});

// 🏨 GET /api/assignments/hotel/:hotelId/:eventId - Assignations d'un hôtel pour un événement
router.get('/hotel/:hotelId/:eventId', async (req, res) => {
  try {
    const { hotelId, eventId } = req.params;

    const assignment = await Assignment.findOne({ hotelId, eventId })
      .populate('hotelId', 'name address rating')
      .populate('logicalRooms.assignedClients.clientId', 'firstName lastName gender clientType groupName phone assignment onSite');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Aucune assignation trouvée pour cet hôtel et événement'
      });
    }

    // Mettre à jour les statistiques
    assignment.updateStats();
    await assignment.save();

    res.json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('Erreur GET assignment hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'assignation'
    });
  }
});

// 🤖 POST /api/assignments/auto-assign/:eventId - Assignation automatique
router.post('/auto-assign/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { preserveManual = true } = req.body;

    console.log(`🤖 Début assignation automatique pour événement: ${eventId}`);

    // Vérifier l'événement
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Récupérer tous les clients de l'événement
    let clientsQuery = { eventId };
    if (preserveManual) {
      // Exclure les clients assignés manuellement
      clientsQuery['assignment.assignmentType'] = { $ne: 'manual' };
    }

    const clients = await Client.find(clientsQuery).sort({ clientType: 1, groupName: 1 });
    console.log(`📊 ${clients.length} clients à assigner automatiquement`);

    // Récupérer les hôtels disponibles pour cet événement
    const availableHotels = await Hotel.find({ eventId }).sort({ name: 1 });
    
    if (availableHotels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun hôtel disponible pour cet événement'
      });
    }

    // 🧠 ALGORITHME D'ASSIGNATION AUTOMATIQUE
    const assignmentResult = await autoAssignClients(clients, availableHotels, eventId);

    res.json({
      success: true,
      message: `Assignation automatique réussie: ${assignmentResult.assigned} clients assignés`,
      data: {
        event: event.name,
        totalClients: clients.length,
        assigned: assignmentResult.assigned,
        unassigned: assignmentResult.unassigned,
        errors: assignmentResult.errors,
        warnings: assignmentResult.warnings
      }
    });

  } catch (error) {
    console.error('❌ Erreur assignation automatique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation automatique',
      error: error.message
    });
  }
});

// ✋ POST /api/assignments/manual-assign - Assignation manuelle
router.post('/manual-assign', async (req, res) => {
  try {
    const { 
      clientId, 
      hotelId, 
      eventId, 
      logicalRoomId, 
      userId = 'manual_user',
      forceAssign = false 
    } = req.body;

    console.log(`✋ Assignation manuelle: Client ${clientId} → Hôtel ${hotelId}, Chambre ${logicalRoomId}`);

    // Validations
    const client = await Client.findById(clientId);
    if (!client || client.eventId.toString() !== eventId) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé ou n\'appartient pas à cet événement'
      });
    }

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Trouver ou créer l'assignation de l'hôtel
    let assignment = await Assignment.findOne({ hotelId, eventId });
    if (!assignment) {
      assignment = new Assignment({
        eventId,
        hotelId,
        logicalRooms: []
      });
    }

    // Trouver ou créer la chambre logique
    let logicalRoom = assignment.logicalRooms.find(room => room.logicalRoomId === logicalRoomId);
    if (!logicalRoom) {
      // Créer une nouvelle chambre logique
      logicalRoom = {
        logicalRoomId,
        roomType: determineRoomType(client),
        bedCount: 2, // Valeur par défaut, peut être modifiée
        maxCapacity: determineMaxCapacity(client),
        assignedClients: []
      };
      assignment.logicalRooms.push(logicalRoom);
    }

    // Vérifier la capacité si pas de forçage
    if (!forceAssign && logicalRoom.assignedClients.length >= logicalRoom.maxCapacity) {
      return res.status(400).json({
        success: false,
        message: `Chambre ${logicalRoomId} pleine (${logicalRoom.maxCapacity} places max)`
      });
    }

    // Vérifier si le client est déjà assigné ailleurs
    if (client.assignment?.hotelId) {
      // Retirer l'ancienne assignation
      await removeClientFromAssignment(client.assignment.hotelId, client._id, eventId);
    }

    // Ajouter le client à la chambre
    logicalRoom.assignedClients.push({
      clientId: client._id,
      assignmentType: 'manual',
      assignedAt: new Date(),
      assignedBy: userId
    });

    // Mettre à jour le client
    client.assignment = {
      hotelId: hotelId,
      logicalRoomId: logicalRoomId,
      assignmentType: 'manual',
      assignedAt: new Date(),
      assignedBy: userId
    };

    // Sauvegarder
    assignment.updateStats();
    await assignment.save();
    await client.save();

    res.json({
      success: true,
      message: `Client ${client.firstName} ${client.lastName} assigné manuellement à la chambre ${logicalRoomId}`,
      data: {
        client: {
          _id: client._id,
          name: `${client.firstName} ${client.lastName}`,
          assignment: client.assignment
        },
        room: logicalRoom
      }
    });

  } catch (error) {
    console.error('❌ Erreur assignation manuelle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation manuelle',
      error: error.message
    });
  }
});

// 🏨 POST /api/assignments/set-real-room - Assigner numéro de chambre réel
router.post('/set-real-room', async (req, res) => {
  try {
    const { hotelId, eventId, logicalRoomId, realRoomNumber } = req.body;

    const assignment = await Assignment.findOne({ hotelId, eventId });
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    const logicalRoom = assignment.logicalRooms.find(room => room.logicalRoomId === logicalRoomId);
    if (!logicalRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chambre logique non trouvée'
      });
    }

    // Vérifier que le numéro n'est pas déjà utilisé
    const existingRoom = assignment.logicalRooms.find(room => 
      room.realRoomNumber === realRoomNumber && room.logicalRoomId !== logicalRoomId
    );
    
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: `Le numéro de chambre ${realRoomNumber} est déjà utilisé`
      });
    }

    // Assigner le numéro réel
    logicalRoom.realRoomNumber = realRoomNumber;
    assignment.status = 'OnSite';

    await assignment.save();

    res.json({
      success: true,
      message: `Numéro de chambre ${realRoomNumber} assigné à la chambre logique ${logicalRoomId}`,
      data: logicalRoom
    });

  } catch (error) {
    console.error('❌ Erreur assignation numéro réel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation du numéro réel'
    });
  }
});

// 💰 POST /api/assignments/update-deposit - Mettre à jour statut caution
router.post('/update-deposit', async (req, res) => {
  try {
    const { clientId, depositPaid, depositAmount, userId } = req.body;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Mettre à jour les informations sur place
    client.onSite = {
      ...client.onSite,
      depositPaid: depositPaid,
      depositAmount: depositAmount || client.onSite?.depositAmount || 0
    };

    if (depositPaid && !client.onSite.checkedInAt) {
      client.onSite.checkedInAt = new Date();
      client.onSite.checkedInBy = userId;
    }

    await client.save();

    res.json({
      success: true,
      message: `Statut caution mis à jour pour ${client.firstName} ${client.lastName}`,
      data: {
        client: {
          _id: client._id,
          name: `${client.firstName} ${client.lastName}`,
          onSite: client.onSite
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour caution:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de la caution'
    });
  }
});

// 🗑️ DELETE /api/assignments/remove-client - Retirer un client d'une assignation
router.delete('/remove-client', async (req, res) => {
  try {
    const { clientId, eventId } = req.body;

    const client = await Client.findById(clientId);
    if (!client || client.eventId.toString() !== eventId) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    if (!client.assignment?.hotelId) {
      return res.status(400).json({
        success: false,
        message: 'Client non assigné'
      });
    }

    // Retirer de l'assignation
    await removeClientFromAssignment(client.assignment.hotelId, clientId, eventId);

    // Nettoyer l'assignation du client
    client.assignment = {
      hotelId: null,
      logicalRoomId: null,
      assignmentType: null,
      assignedAt: null,
      assignedBy: null
    };

    await client.save();

    res.json({
      success: true,
      message: `Client ${client.firstName} ${client.lastName} retiré de son assignation`,
      data: client
    });

  } catch (error) {
    console.error('❌ Erreur suppression assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de l\'assignation'
    });
  }
});

// 📊 GET /api/assignments/stats/:eventId - Statistiques détaillées
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    const assignments = await Assignment.find({ eventId })
      .populate('hotelId', 'name')
      .populate('logicalRooms.assignedClients.clientId', 'firstName lastName clientType gender');

    const clients = await Client.find({ eventId });

    const stats = {
      totalClients: clients.length,
      assignedClients: clients.filter(c => c.assignment?.hotelId).length,
      unassignedClients: clients.filter(c => !c.assignment?.hotelId).length,
      
      byType: {},
      byGender: { Homme: 0, Femme: 0, Autre: 0 },
      byHotel: [],
      
      roomsStats: {
        totalRooms: 0,
        occupiedRooms: 0,
        emptyRooms: 0,
        fullRooms: 0
      }
    };

    // Statistiques par type
    clients.forEach(client => {
      if (!stats.byType[client.clientType]) {
        stats.byType[client.clientType] = { total: 0, assigned: 0, unassigned: 0 };
      }
      stats.byType[client.clientType].total++;
      
      if (client.assignment?.hotelId) {
        stats.byType[client.clientType].assigned++;
      } else {
        stats.byType[client.clientType].unassigned++;
      }

      stats.byGender[client.gender] = (stats.byGender[client.gender] || 0) + 1;
    });

    // Statistiques par hôtel
    assignments.forEach(assignment => {
      const hotelStats = {
        hotelId: assignment.hotelId._id,
        hotelName: assignment.hotelId.name,
        totalRooms: assignment.logicalRooms.length,
        totalCapacity: assignment.stats.totalCapacity,
        totalAssigned: assignment.stats.totalAssigned,
        occupancyRate: assignment.stats.occupancyRate,
        emptyRooms: assignment.logicalRooms.filter(r => r.assignedClients.length === 0).length,
        fullRooms: assignment.logicalRooms.filter(r => r.isFullyOccupied).length
      };
      
      stats.byHotel.push(hotelStats);
      stats.roomsStats.totalRooms += hotelStats.totalRooms;
      stats.roomsStats.emptyRooms += hotelStats.emptyRooms;
      stats.roomsStats.fullRooms += hotelStats.fullRooms;
    });

    stats.roomsStats.occupiedRooms = stats.roomsStats.totalRooms - stats.roomsStats.emptyRooms;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Erreur statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du calcul des statistiques'
    });
  }
});

// 🧠 FONCTIONS UTILITAIRES

/**
 * Algorithme d'assignation automatique
 */
async function autoAssignClients(clients, hotels, eventId) {
  const result = {
    assigned: 0,
    unassigned: 0,
    errors: [],
    warnings: []
  };

  try {
    // Organiser les clients par priorité d'assignation
    const clientsByPriority = organizeClientsByPriority(clients);
    
    console.log('📋 Clients organisés par priorité:', {
      vip: clientsByPriority.vip.length,
      influenceurs: clientsByPriority.influenceurs.length,
      groupes: clientsByPriority.groupes.length,
      solos: clientsByPriority.solos.length,
      staff: clientsByPriority.staff.length
    });

    // Récupérer ou créer les assignations pour chaque hôtel
    const hotelAssignments = new Map();
    for (const hotel of hotels) {
      let assignment = await Assignment.findOne({ hotelId: hotel._id, eventId });
      if (!assignment) {
        assignment = new Assignment({
          eventId,
          hotelId: hotel._id,
          logicalRooms: []
        });
      }
      hotelAssignments.set(hotel._id.toString(), assignment);
    }

    // 1️⃣ ASSIGNATION VIP (priorité maximale)
    await assignVIPClients(clientsByPriority.vip, hotelAssignments, result);

    // 2️⃣ ASSIGNATION INFLUENCEURS
    await assignInfluenceurClients(clientsByPriority.influenceurs, hotelAssignments, result);

    // 3️⃣ ASSIGNATION GROUPES
    await assignGroupClients(clientsByPriority.groupes, hotelAssignments, result);

    // 4️⃣ ASSIGNATION STAFF
    await assignStaffClients(clientsByPriority.staff, hotelAssignments, result);

    // 5️⃣ ASSIGNATION SOLOS (remplissage)
    await assignSoloClients(clientsByPriority.solos, hotelAssignments, result);

    // Sauvegarder toutes les assignations
    for (const [hotelId, assignment] of hotelAssignments) {
      assignment.updateStats();
      assignment.lastAutoAssignment = new Date();
      await assignment.save();
    }

    console.log('✅ Assignation automatique terminée:', result);
    return result;

  } catch (error) {
    console.error('❌ Erreur algorithme assignation:', error);
    result.errors.push(`Erreur algorithme: ${error.message}`);
    return result;
  }
}

/**
 * Organiser les clients par priorité d'assignation
 */
function organizeClientsByPriority(clients) {
  const organized = {
    vip: [],
    influenceurs: [],
    groupes: new Map(), // groupName -> clients[]
    solos: [],
    staff: []
  };

  clients.forEach(client => {
    switch (client.clientType) {
      case 'VIP':
        organized.vip.push(client);
        break;
      case 'Influenceur':
        organized.influenceurs.push(client);
        break;
      case 'Staff':
        organized.staff.push(client);
        break;
      case 'Solo':
        organized.solos.push(client);
        break;
      case 'Groupe':
        if (!organized.groupes.has(client.groupName)) {
          organized.groupes.set(client.groupName, []);
        }
        organized.groupes.get(client.groupName).push(client);
        break;
    }
  });

  // Convertir les groupes en array pour faciliter le traitement
  organized.groupes = Array.from(organized.groupes.values());

  return organized;
}

/**
 * Assigner les clients VIP
 */
async function assignVIPClients(vipClients, hotelAssignments, result) {
  const vipGroups = new Map();
  const vipSolos = [];

  // Séparer VIP solos et groupes
  vipClients.forEach(client => {
    if (client.groupName) {
      if (!vipGroups.has(client.groupName)) {
        vipGroups.set(client.groupName, []);
      }
      vipGroups.get(client.groupName).push(client);
    } else {
      vipSolos.push(client);
    }
  });

  // Assigner les groupes VIP (priorité sur les solos)
  for (const [groupName, groupMembers] of vipGroups) {
    const assigned = await assignGroupToRoom(groupMembers, hotelAssignments, 'VIP', true);
    if (assigned) {
      result.assigned += groupMembers.length;
      console.log(`✅ Groupe VIP "${groupName}" assigné (${groupMembers.length} membres)`);
    } else {
      result.unassigned += groupMembers.length;
      result.errors.push(`❌ Impossible d'assigner le groupe VIP "${groupName}"`);
    }
  }

  // Assigner les VIP solos
  for (const client of vipSolos) {
    const assigned = await assignClientToRoom(client, hotelAssignments, 'VIP', true);
    if (assigned) {
      result.assigned++;
      console.log(`✅ VIP solo "${client.firstName} ${client.lastName}" assigné`);
    } else {
      result.unassigned++;
      result.errors.push(`❌ Impossible d'assigner VIP solo "${client.firstName} ${client.lastName}"`);
    }
  }
}

/**
 * Assigner les clients Influenceurs (même logique que VIP)
 */
async function assignInfluenceurClients(influenceurClients, hotelAssignments, result) {
  const influenceurGroups = new Map();
  const influenceurSolos = [];

  influenceurClients.forEach(client => {
    if (client.groupName) {
      if (!influenceurGroups.has(client.groupName)) {
        influenceurGroups.set(client.groupName, []);
      }
      influenceurGroups.get(client.groupName).push(client);
    } else {
      influenceurSolos.push(client);
    }
  });

  // Groupes Influenceurs
  for (const [groupName, groupMembers] of influenceurGroups) {
    const assigned = await assignGroupToRoom(groupMembers, hotelAssignments, 'Influenceur', true);
    if (assigned) {
      result.assigned += groupMembers.length;
      console.log(`✅ Groupe Influenceur "${groupName}" assigné (${groupMembers.length} membres)`);
    } else {
      result.unassigned += groupMembers.length;
      result.errors.push(`❌ Impossible d'assigner le groupe Influenceur "${groupName}"`);
    }
  }

  // Influenceurs solos
  for (const client of influenceurSolos) {
    const assigned = await assignClientToRoom(client, hotelAssignments, 'Influenceur', true);
    if (assigned) {
      result.assigned++;
    } else {
      result.unassigned++;
      result.errors.push(`❌ Impossible d'assigner Influenceur solo "${client.firstName} ${client.lastName}"`);
    }
  }
}

/**
 * Assigner les groupes normaux
 */
async function assignGroupClients(groupes, hotelAssignments, result) {
  for (const groupMembers of groupes) {
    const groupName = groupMembers[0].groupName;
    
    // Vérifier si le groupe est mixte
    const genders = [...new Set(groupMembers.map(c => c.gender))];
    if (genders.length > 1) {
      result.unassigned += groupMembers.length;
      result.errors.push(`❌ Groupe mixte "${groupName}" refusé (doit être VIP ou se séparer)`);
      continue;
    }

    const gender = genders[0];
    const roomType = `Groupe_${gender}`;

    const assigned = await assignGroupToRoom(groupMembers, hotelAssignments, roomType, false);
    if (assigned) {
      result.assigned += groupMembers.length;
      console.log(`✅ Groupe "${groupName}" assigné (${groupMembers.length} ${gender}s)`);
    } else {
      result.unassigned += groupMembers.length;
      result.errors.push(`❌ Impossible d'assigner le groupe "${groupName}"`);
    }
  }
}

/**
 * Assigner les clients Staff
 */
async function assignStaffClients(staffClients, hotelAssignments, result) {
  const staffByGender = {
    Homme: staffClients.filter(c => c.gender === 'Homme'),
    Femme: staffClients.filter(c => c.gender === 'Femme'),
    Autre: staffClients.filter(c => c.gender === 'Autre')
  };

  for (const [gender, clients] of Object.entries(staffByGender)) {
    if (clients.length === 0) continue;

    const roomType = `Staff_${gender}`;
    
    for (const client of clients) {
      const assigned = await assignClientToRoom(client, hotelAssignments, roomType, false);
      if (assigned) {
        result.assigned++;
      } else {
        result.unassigned++;
        result.errors.push(`❌ Impossible d'assigner Staff ${client.firstName} ${client.lastName}`);
      }
    }
  }
}

/**
 * Assigner les clients Solo (remplissage des chambres existantes)
 */
async function assignSoloClients(soloClients, hotelAssignments, result) {
  for (const client of soloClients) {
    // Chercher une chambre de groupe compatible (même genre, pas Staff)
    const compatibleRoomType = `Groupe_${client.gender}`;
    
    const assigned = await assignClientToRoom(client, hotelAssignments, compatibleRoomType, false, true);
    if (assigned) {
      result.assigned++;
      console.log(`✅ Solo ${client.firstName} ${client.lastName} ajouté à un groupe ${client.gender}`);
    } else {
      result.unassigned++;
      result.warnings.push(`⚠️ Aucune place disponible pour solo ${client.firstName} ${client.lastName}`);
    }
  }
}

/**
 * Assigner un groupe à une chambre
 */
async function assignGroupToRoom(groupMembers, hotelAssignments, roomType, isPrivate) {
  const groupSize = groupMembers.length;
  const groupName = groupMembers[0].groupName || 'Groupe';

  // RÈGLE D'OR: Même hôtel pour un groupe
  for (const [hotelId, assignment] of hotelAssignments) {
    // Chercher une chambre disponible ou créer une nouvelle
    let availableRoom = assignment.logicalRooms.find(room => 
      room.roomType === roomType && 
      (isPrivate ? room.assignedClients.length === 0 : room.maxCapacity - room.assignedClients.length >= groupSize)
    );

    if (!availableRoom && (isPrivate || assignment.logicalRooms.length < 20)) { // Limite de 20 chambres par hôtel
      // Créer une nouvelle chambre
      const roomId = `room_${assignment.logicalRooms.length + 1}`;
      availableRoom = {
        logicalRoomId: roomId,
        roomType: roomType,
        bedCount: Math.ceil(groupSize / 2), // 2 personnes par lit
        maxCapacity: isPrivate ? groupSize : Math.max(groupSize, 4),
        assignedClients: [],
        currentOccupancy: 0,
        isFullyOccupied: false
      };
      assignment.logicalRooms.push(availableRoom);
      console.log(`🏠 Nouvelle chambre créée: ${roomId} (${roomType})`);
    }

    if (availableRoom) {
      // Assigner tous les membres du groupe
      for (const member of groupMembers) {
        availableRoom.assignedClients.push({
          clientId: member._id,
          assignmentType: 'auto',
          assignedAt: new Date(),
          assignedBy: 'system'
        });

        // Mettre à jour le client
        member.assignment = {
          hotelId: assignment.hotelId,
          logicalRoomId: availableRoom.logicalRoomId,
          assignmentType: 'auto',
          assignedAt: new Date(),
          assignedBy: 'system'
        };
        await member.save();
      }

      console.log(`✅ Groupe "${groupName}" assigné à ${availableRoom.logicalRoomId}`);
      return true;
    }
  }

  console.log(`❌ Aucune place disponible pour le groupe "${groupName}"`);
  return false;
}

/**
 * Assigner un client individuel à une chambre
 */
async function assignClientToRoom(client, hotelAssignments, roomType, isPrivate, fillExisting = false) {
  for (const [hotelId, assignment] of hotelAssignments) {
    let availableRoom;

    if (fillExisting) {
      // Pour les solos: chercher une chambre existante avec de la place
      availableRoom = assignment.logicalRooms.find(room =>
        room.roomType === roomType &&
        room.assignedClients.length > 0 && // Chambre déjà occupée
        room.assignedClients.length < room.maxCapacity &&
        !room.assignedClients.some(ac => ac.assignmentType === 'manual') // Éviter les chambres avec assignations manuelles
      );
    } else {
      // Chercher une chambre disponible
      availableRoom = assignment.logicalRooms.find(room =>
        room.roomType === roomType &&
        (isPrivate ? room.assignedClients.length === 0 : room.assignedClients.length < room.maxCapacity)
      );
    }

    if (!availableRoom && !fillExisting && assignment.logicalRooms.length < 20) {
      // Créer une nouvelle chambre pour client individuel
      const roomId = `room_${assignment.logicalRooms.length + 1}`;
      availableRoom = {
        logicalRoomId: roomId,
        roomType: roomType,
        bedCount: isPrivate ? 1 : 2,
        maxCapacity: isPrivate ? 1 : 4,
        assignedClients: [],
        currentOccupancy: 0,
        isFullyOccupied: false
      };
      assignment.logicalRooms.push(availableRoom);
    }

    if (availableRoom) {
      // Assigner le client
      availableRoom.assignedClients.push({
        clientId: client._id,
        assignmentType: 'auto',
        assignedAt: new Date(),
        assignedBy: 'system'
      });

      // Mettre à jour le client
      client.assignment = {
        hotelId: assignment.hotelId,
        logicalRoomId: availableRoom.logicalRoomId,
        assignmentType: 'auto',
        assignedAt: new Date(),
        assignedBy: 'system'
      };
      await client.save();

      return true;
    }
  }

  return false;
}

/**
 * Déterminer le type de chambre selon le client
 */
function determineRoomType(client) {
  switch (client.clientType) {
    case 'VIP':
      return 'VIP';
    case 'Influenceur':
      return 'Influenceur';
    case 'Staff':
      return `Staff_${client.gender}`;
    case 'Groupe':
      return `Groupe_${client.gender}`;
    case 'Solo':
      return `Groupe_${client.gender}`; // Les solos rejoignent des groupes
    default:
      return `Groupe_${client.gender}`;
  }
}

/**
 * Déterminer la capacité maximale selon le client
 */
function determineMaxCapacity(client) {
  switch (client.clientType) {
    case 'VIP':
    case 'Influenceur':
      return client.groupSize || 1;
    case 'Staff':
    case 'Groupe':
    case 'Solo':
    default:
      return 4; // Capacité standard
  }
}

/**
 * Retirer un client d'une assignation
 */
async function removeClientFromAssignment(hotelId, clientId, eventId) {
  const assignment = await Assignment.findOne({ hotelId, eventId });
  if (!assignment) return;

  for (const room of assignment.logicalRooms) {
    const clientIndex = room.assignedClients.findIndex(
      ac => ac.clientId.toString() === clientId.toString()
    );
    
    if (clientIndex !== -1) {
      room.assignedClients.splice(clientIndex, 1);
      break;
    }
  }

  // Supprimer les chambres vides (sauf si assignations manuelles)
  assignment.logicalRooms = assignment.logicalRooms.filter(room => 
    room.assignedClients.length > 0 || 
    room.assignedClients.some(ac => ac.assignmentType === 'manual')
  );

  assignment.updateStats();
  await assignment.save();
}

module.exports = router;