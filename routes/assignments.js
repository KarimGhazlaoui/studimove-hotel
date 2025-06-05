const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Hotel = require('../models/Hotel');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment'); // Nous devrons créer ce modèle
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

    // Récupérer tous les hôtels de l'événement avec leurs clients assignés
    const hotels = await Hotel.find({ eventId }).populate({
      path: 'assignedClients.clientId',
      model: 'Client'
    });

    // Transformer les données pour le format attendu par le frontend
    const assignments = hotels.map(hotel => ({
      hotelId: hotel,
      logicalRooms: hotel.logicalRooms || [],
      assignedClients: hotel.assignedClients || [],
      stats: {
        totalCapacity: hotel.totalCapacity,
        assignedCount: hotel.assignedClients?.length || 0,
        availableSpots: hotel.totalCapacity - (hotel.assignedClients?.length || 0)
      }
    }));

    res.json({
      success: true,
      data: assignments,
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
    const { clientId, hotelId, eventId, roomPreference } = req.body;

    // Validations
    const client = await Client.findById(clientId);
    const hotel = await Hotel.findById(hotelId);
    const event = await Event.findById(eventId);

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

    // Vérifier que l'hôtel appartient à cet événement
    if (hotel.eventId.toString() !== eventId) {
      return res.status(400).json({
        success: false,
        message: 'L\'hôtel ne fait pas partie de cet événement'
      });
    }

    // Vérifier si le client est déjà assigné
    const alreadyAssigned = await Hotel.findOne({
      eventId: eventId,
      'assignedClients.clientId': clientId
    });

    if (alreadyAssigned) {
      return res.status(400).json({
        success: false,
        message: 'Le client est déjà assigné à un hôtel'
      });
    }

    // Vérifier la capacité disponible
    const currentAssignments = hotel.assignedClients?.length || 0;
    if (currentAssignments >= hotel.totalCapacity) {
      return res.status(400).json({
        success: false,
        message: 'L\'hôtel a atteint sa capacité maximale'
      });
    }

    // Créer l'assignation
    const assignmentData = {
      clientId: clientId,
      assignedAt: new Date(),
      roomPreference: roomPreference || null,
      assignedBy: 'manual' // ou req.user.id si vous avez l'auth
    };

    // Ajouter à l'hôtel
    hotel.assignedClients = hotel.assignedClients || [];
    hotel.assignedClients.push(assignmentData);
    await hotel.save();

    // Mettre à jour le statut du client
    client.status = 'Assigné';
    client.assignedHotel = hotelId;
    await client.save();

    // Retourner les données mises à jour
    await hotel.populate('assignedClients.clientId');

    res.json({
      success: true,
      message: `${client.firstName} ${client.lastName} assigné(e) à ${hotel.name}`,
      data: {
        hotel: hotel,
        client: client,
        assignment: assignmentData
      }
    });
  } catch (error) {
    console.error('Erreur assignation manuelle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation'
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
      allowMixedGroups = false 
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

    // Récupérer les hôtels avec capacité disponible
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
        const groupSize = members.length;
        
        // Vérifier si le groupe est mixte
        const genders = [...new Set(members.map(m => m.gender))];
        const isMixed = genders.length > 1;
        
        if (isMixed && !allowMixedGroups) {
          // Chercher un hôtel VIP pour groupes mixtes
          const suitableHotel = hotels.find(hotel => {
            const currentAssignments = hotel.assignedClients?.length || 0;
            return (hotel.category === 'VIP' || hotel.allowMixedGroups) && 
                   (currentAssignments + groupSize <= hotel.totalCapacity);
          });

          if (suitableHotel) {
            // Assigner tout le groupe
            for (const member of members) {
              await assignClientToHotel(member, suitableHotel);
              assignedCount++;
            }
            assignments.push({
              type: 'group',
              groupName: groupName,
              members: members.length,
              hotel: suitableHotel.name,
              isMixed: true
            });
          } else {
            errors.push(`Groupe mixte "${groupName}" nécessite un hôtel VIP non disponible`);
          }
        } else {
          // Groupe non mixte, chercher n'importe quel hôtel avec capacité
          const suitableHotel = hotels.find(hotel => {
            const currentAssignments = hotel.assignedClients?.length || 0;
            return currentAssignments + groupSize <= hotel.totalCapacity;
          });

          if (suitableHotel) {
            for (const member of members) {
              await assignClientToHotel(member, suitableHotel);
              assignedCount++;
            }
            assignments.push({
              type: 'group',
              groupName: groupName,
              members: members.length,
              hotel: suitableHotel.name,
              isMixed: false
            });
          } else {
            errors.push(`Pas assez de place pour le groupe "${groupName}" (${groupSize} personnes)`);
          }
        }
      }
    }

    // Assigner les clients solo restants
    const remainingClients = sortedClients.filter(client => 
      !client.groupName && client.status !== 'Assigné'
    );

    for (const client of remainingClients) {
      const suitableHotel = hotels.find(hotel => {
        const currentAssignments = hotel.assignedClients?.length || 0;
        return currentAssignments < hotel.totalCapacity;
      });

      if (suitableHotel) {
        await assignClientToHotel(client, suitableHotel);
        assignedCount++;
        assignments.push({
          type: 'solo',
          client: `${client.firstName} ${client.lastName}`,
          hotel: suitableHotel.name
        });
      } else {
        errors.push(`Pas de place disponible pour ${client.firstName} ${client.lastName}`);
      }
    }

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
      message: 'Erreur serveur lors de l\'assignation automatique'
    });
  }
});

// Fonction helper pour assigner un client à un hôtel
async function assignClientToHotel(client, hotel) {
  const assignmentData = {
    clientId: client._id,
    assignedAt: new Date(),
    assignedBy: 'auto'
  };

  hotel.assignedClients = hotel.assignedClients || [];
  hotel.assignedClients.push(assignmentData);
  await hotel.save();

  client.status = 'Assigné';
  client.assignedHotel = hotel._id;
  await client.save();
}

// DELETE /api/assignments/remove-client - Retirer un client d'une assignation
router.delete('/remove-client', async (req, res) => {
  try {
    const { clientId, eventId } = req.body;

    // Trouver l'hôtel où le client est assigné
    const hotel = await Hotel.findOne({
      eventId: eventId,
      'assignedClients.clientId': clientId
    });

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé dans les assignations'
      });
    }

    // Retirer le client de l'hôtel
    hotel.assignedClients = hotel.assignedClients.filter(
      ac => ac.clientId.toString() !== clientId
    );
    await hotel.save();

    // Mettre à jour le statut du client
    const client = await Client.findById(clientId);
    if (client) {
      client.status = 'En attente';
      client.assignedHotel = null;
      await client.save();
    }

    res.json({
      success: true,
      message: 'Client retiré de l\'assignation avec succès',
      data: {
        client: client,
        hotel: hotel.name
      }
    });
  } catch (error) {
    console.error('Erreur suppression assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// GET /api/assignments/stats/:eventId - Statistiques d'assignation
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const [clients, hotels] = await Promise.all([
      Client.find({ eventId }),
      Hotel.find({ eventId })
    ]);

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
          mixed: clients.filter(c => c.groupName).reduce((acc, c) => {
            if (!acc[c.groupName]) {
              const groupMembers = clients.filter(cl => cl.groupName === c.groupName);
              const genders = [...new Set(groupMembers.map(m => m.gender))];
              acc[c.groupName] = genders.length > 1;
            }
            return acc;
          }, {})
        }
      },
      hotels: {
        total: hotels.length,
        totalCapacity: hotels.reduce((sum, h) => sum + h.totalCapacity, 0),
        totalAssigned: hotels.reduce((sum, h) => sum + (h.assignedClients?.length || 0), 0),
        byCategory: hotels.reduce((acc, h) => {
          acc[h.category] = {
            count: (acc[h.category]?.count || 0) + 1,
            capacity: (acc[h.category]?.capacity || 0) + h.totalCapacity,
            assigned: (acc[h.category]?.assigned || 0) + (h.assignedClients?.length || 0)
          };
          return acc;
        }, {}),
        occupancy: hotels.map(h => ({
          name: h.name,
          capacity: h.totalCapacity,
          assigned: h.assignedClients?.length || 0,
          rate: h.totalCapacity > 0 ? ((h.assignedClients?.length || 0) / h.totalCapacity * 100).toFixed(1) : 0
        }))
      },
      summary: {
        assignmentRate: clients.length > 0 ? (clients.filter(c => c.status === 'Assigné').length / clients.length * 100).toFixed(1) : 0,
        occupancyRate: hotels.reduce((sum, h) => sum + h.totalCapacity, 0) > 0 ? 
          (hotels.reduce((sum, h) => sum + (h.assignedClients?.length || 0), 0) / 
           hotels.reduce((sum, h) => sum + h.totalCapacity, 0) * 100).toFixed(1) : 0,
        availableSpots: hotels.reduce((sum, h) => sum + h.totalCapacity, 0) - 
                       hotels.reduce((sum, h) => sum + (h.assignedClients?.length || 0), 0)
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur stats assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// POST /api/assignments/set-real-room - Assigner un numéro de chambre réel
router.post('/set-real-room', async (req, res) => {
  try {
    const { hotelId, eventId, logicalRoomId, realRoomNumber } = req.body;

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Vérifier que la chambre logique existe
    const logicalRoom = hotel.logicalRooms?.find(r => r._id.toString() === logicalRoomId);
    if (!logicalRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chambre logique non trouvée'
      });
    }

    // Vérifier que le numéro de chambre n'est pas déjà utilisé
    const existingRoom = hotel.logicalRooms?.find(r => 
      r.realRoomNumber === realRoomNumber && r._id.toString() !== logicalRoomId
    );

    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: `Le numéro de chambre ${realRoomNumber} est déjà utilisé`
      });
    }

    // Assigner le numéro de chambre
    logicalRoom.realRoomNumber = realRoomNumber;
    logicalRoom.roomAssignedAt = new Date();
    await hotel.save();

    res.json({
      success: true,
      message: `Numéro de chambre ${realRoomNumber} assigné avec succès`,
      data: {
        hotel: hotel.name,
        logicalRoom: logicalRoom,
        realRoomNumber: realRoomNumber
      }
    });
  } catch (error) {
    console.error('Erreur assignation chambre:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation de chambre'
    });
  }
});

// POST /api/assignments/move-client - Déplacer un client d'un hôtel à un autre
router.post('/move-client', async (req, res) => {
  try {
    const { clientId, fromHotelId, toHotelId, eventId } = req.body;

    // Vérifications
    const [client, fromHotel, toHotel] = await Promise.all([
      Client.findById(clientId),
      Hotel.findById(fromHotelId),
      Hotel.findById(toHotelId)
    ]);

    if (!client || !fromHotel || !toHotel) {
      return res.status(404).json({
        success: false,
        message: 'Client ou hôtel non trouvé'
      });
    }

    // Vérifier la capacité de l'hôtel de destination
    const toHotelAssignments = toHotel.assignedClients?.length || 0;
    if (toHotelAssignments >= toHotel.totalCapacity) {
      return res.status(400).json({
        success: false,
        message: 'L\'hôtel de destination a atteint sa capacité maximale'
      });
    }

    // Retirer le client de l'ancien hôtel
    fromHotel.assignedClients = fromHotel.assignedClients?.filter(
      ac => ac.clientId.toString() !== clientId
    ) || [];

    // Ajouter le client au nouveau hôtel
    const assignmentData = {
      clientId: clientId,
      assignedAt: new Date(),
      assignedBy: 'manual-move'
    };
    toHotel.assignedClients = toHotel.assignedClients || [];
    toHotel.assignedClients.push(assignmentData);

    // Sauvegarder les changements
    await Promise.all([
      fromHotel.save(),
      toHotel.save()
    ]);

    // Mettre à jour le client
    client.assignedHotel = toHotelId;
    await client.save();

    res.json({
      success: true,
      message: `${client.firstName} ${client.lastName} déplacé(e) de ${fromHotel.name} vers ${toHotel.name}`,
      data: {
        client: client,
        fromHotel: fromHotel.name,
        toHotel: toHotel.name
      }
    });
  } catch (error) {
    console.error('Erreur déplacement client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du déplacement'
    });
  }
});

// POST /api/assignments/swap-clients - Échanger deux clients
router.post('/swap-clients', async (req, res) => {
  try {
    const { client1Id, client2Id, eventId } = req.body;

    // Récupérer les clients et leurs hôtels
    const [client1, client2] = await Promise.all([
      Client.findById(client1Id),
      Client.findById(client2Id)
    ]);

    if (!client1 || !client2) {
      return res.status(404).json({
        success: false,
        message: 'Un ou plusieurs clients non trouvés'
      });
    }

    if (!client1.assignedHotel || !client2.assignedHotel) {
      return res.status(400).json({
        success: false,
        message: 'Les deux clients doivent être assignés à des hôtels'
      });
    }

    const [hotel1, hotel2] = await Promise.all([
      Hotel.findById(client1.assignedHotel),
      Hotel.findById(client2.assignedHotel)
    ]);

    // Échanger les assignations dans les hôtels
    const assignment1 = hotel1.assignedClients?.find(ac => 
      ac.clientId.toString() === client1Id
    );
    const assignment2 = hotel2.assignedClients?.find(ac => 
      ac.clientId.toString() === client2Id
    );

    if (assignment1) {
      assignment1.clientId = client2Id;
      assignment1.assignedAt = new Date();
      assignment1.assignedBy = 'swap';
    }

    if (assignment2) {
      assignment2.clientId = client1Id;
      assignment2.assignedAt = new Date();
      assignment2.assignedBy = 'swap';
    }

    // Échanger les références dans les clients
    const tempHotel = client1.assignedHotel;
    client1.assignedHotel = client2.assignedHotel;
    client2.assignedHotel = tempHotel;

    // Sauvegarder tous les changements
    await Promise.all([
      hotel1.save(),
      hotel2.save(),
      client1.save(),
      client2.save()
    ]);

    res.json({
      success: true,
      message: `Échange effectué entre ${client1.firstName} ${client1.lastName} et ${client2.firstName} ${client2.lastName}`,
      data: {
        client1: {
          name: `${client1.firstName} ${client1.lastName}`,
          newHotel: hotel2.name
        },
        client2: {
          name: `${client2.firstName} ${client2.lastName}`,
          newHotel: hotel1.name
        }
      }
    });
  } catch (error) {
    console.error('Erreur échange clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'échange'
    });
  }
});

// POST /api/assignments/validate - Valider les assignations
router.post('/validate/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const [clients, hotels] = await Promise.all([
      Client.find({ eventId }),
      Hotel.find({ eventId })
    ]);

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      stats: {}
    };

    // Vérifier les capacités
    for (const hotel of hotels) {
      const assignedCount = hotel.assignedClients?.length || 0;
      if (assignedCount > hotel.totalCapacity) {
        validation.isValid = false;
        validation.errors.push({
          type: 'OVERCAPACITY',
          message: `${hotel.name} dépasse sa capacité (${assignedCount}/${hotel.totalCapacity})`,
          hotel: hotel.name,
          current: assignedCount,
          max: hotel.totalCapacity
        });
      }
    }

    // Vérifier les groupes mixtes
    const groups = {};
    clients.filter(c => c.groupName).forEach(client => {
      if (!groups[client.groupName]) {
        groups[client.groupName] = {
          members: [],
          hotels: new Set()
        };
      }
      groups[client.groupName].members.push(client);
      if (client.assignedHotel) {
        groups[client.groupName].hotels.add(client.assignedHotel.toString());
      }
    });

    for (const [groupName, groupData] of Object.entries(groups)) {
      const genders = [...new Set(groupData.members.map(m => m.gender))];
      const isMixed = genders.length > 1;
      
      if (isMixed) {
        // Vérifier si le groupe mixte est dans un hôtel VIP
        const assignedHotels = Array.from(groupData.hotels);
        for (const hotelId of assignedHotels) {
          const hotel = hotels.find(h => h._id.toString() === hotelId);
          if (hotel && hotel.category !== 'VIP') {
            validation.warnings.push({
              type: 'MIXED_GROUP_NOT_VIP',
              message: `Groupe mixte "${groupName}" dans un hôtel non-VIP (${hotel.name})`,
              group: groupName,
              hotel: hotel.name
            });
          }
        }
      }

      if (groupData.hotels.size > 1) {
        validation.warnings.push({
          type: 'GROUP_SEPARATED',
          message: `Groupe "${groupName}" séparé dans ${groupData.hotels.size} hôtels`,
          group: groupName,
          hotelCount: groupData.hotels.size
        });
      }
    }

    // Clients non assignés
    const unassignedClients = clients.filter(c => c.status !== 'Assigné');
    if (unassignedClients.length > 0) {
      validation.warnings.push({
        type: 'UNASSIGNED_CLIENTS',
        message: `${unassignedClients.length} client(s) non assigné(s)`,
        count: unassignedClients.length,
        clients: unassignedClients.map(c => `${c.firstName} ${c.lastName}`)
      });
    }

    // Statistiques de validation
    validation.stats = {
      totalClients: clients.length,
      assignedClients: clients.filter(c => c.status === 'Assigné').length,
      unassignedClients: unassignedClients.length,
      totalHotels: hotels.length,
      totalCapacity: hotels.reduce((sum, h) => sum + h.totalCapacity, 0),
      totalAssigned: hotels.reduce((sum, h) => sum + (h.assignedClients?.length || 0), 0),
      occupancyRate: hotels.reduce((sum, h) => sum + h.totalCapacity, 0) > 0 ? 
        (hotels.reduce((sum, h) => sum + (h.assignedClients?.length || 0), 0) / 
         hotels.reduce((sum, h) => sum + h.totalCapacity, 0) * 100).toFixed(1) : 0,
      groupsCount: Object.keys(groups).length,
      mixedGroupsCount: Object.values(groups).filter(g => {
        const genders = [...new Set(g.members.map(m => m.gender))];
        return genders.length > 1;
      }).length
    };

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Erreur validation assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la validation'
    });
  }
});

// POST /api/assignments/bulk-assign - Assignation en lot
router.post('/bulk-assign', async (req, res) => {
  try {
    const { clientIds, hotelId, eventId } = req.body;

    if (!clientIds || clientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client sélectionné'
      });
    }

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Vérifier la capacité
    const currentAssignments = hotel.assignedClients?.length || 0;
    const availableSpots = hotel.totalCapacity - currentAssignments;

    if (clientIds.length > availableSpots) {
      return res.status(400).json({
        success: false,
        message: `Pas assez de places disponibles. Places libres: ${availableSpots}, clients à assigner: ${clientIds.length}`
      });
    }

    // Récupérer les clients
    const clients = await Client.find({
      _id: { $in: clientIds },
      eventId: eventId,
      status: { $ne: 'Assigné' }
    });

    if (clients.length !== clientIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Certains clients sont déjà assignés ou n\'existent pas'
      });
    }

    let assignedCount = 0;
    const assignments = [];

    // Assigner tous les clients
    for (const client of clients) {
      const assignmentData = {
        clientId: client._id,
        assignedAt: new Date(),
        assignedBy: 'bulk'
      };

      hotel.assignedClients = hotel.assignedClients || [];
      hotel.assignedClients.push(assignmentData);

      client.status = 'Assigné';
      client.assignedHotel = hotelId;
      await client.save();

      assignedCount++;
      assignments.push({
        client: `${client.firstName} ${client.lastName}`,
        clientType: client.clientType
      });
    }

    await hotel.save();

    res.json({
      success: true,
      message: `${assignedCount} client(s) assigné(s) en lot à ${hotel.name}`,
      data: {
        assignedCount,
        hotel: hotel.name,
        assignments
      }
    });
  } catch (error) {
    console.error('Erreur assignation en lot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation en lot'
    });
  }
});

// DELETE /api/assignments/clear/:eventId - Vider toutes les assignations d'un événement
router.delete('/clear/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Réinitialiser tous les hôtels
    await Hotel.updateMany(
      { eventId: eventId },
      { $set: { assignedClients: [] } }
    );

    // Réinitialiser tous les clients
    await Client.updateMany(
      { eventId: eventId },
      { 
        $set: { 
          status: 'En attente',
          assignedHotel: null
        }
      }
    );

    const [totalClients, totalHotels] = await Promise.all([
      Client.countDocuments({ eventId: eventId }),
      Hotel.countDocuments({ eventId: eventId })
    ]);

    res.json({
      success: true,
      message: 'Toutes les assignations ont été supprimées',
      data: {
        clearedClients: totalClients,
        clearedHotels: totalHotels
      }
    });
  } catch (error) {
    console.error('Erreur suppression assignations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression des assignations'
    });
  }
});

module.exports = router;
