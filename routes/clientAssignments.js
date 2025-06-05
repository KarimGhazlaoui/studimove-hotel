const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const EventHotelAssignment = require('../models/EventHotelAssignment');

// POST /api/clients/assign-to-hotel - Assigner des clients à un hôtel
router.post('/assign-to-hotel', async (req, res) => {
  try {
    const { clientIds, hotelId, assignmentId, roomType } = req.body;

    // Validation
    if (!clientIds || clientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client sélectionné'
      });
    }

    if (!assignmentId || !roomType) {
      return res.status(400).json({
        success: false,
        message: 'Assignation et type de chambre requis'
      });
    }

    // Récupérer l'assignation
    const assignment = await EventHotelAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    // Extraire le nombre de lits du type de chambre
    const bedCount = parseInt(roomType.split('_')[0]);
    
    // Trouver le type de chambre correspondant
    const roomIndex = assignment.availableRooms.findIndex(room => room.bedCount === bedCount);
    if (roomIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Type de chambre non trouvé'
      });
    }

    const room = assignment.availableRooms[roomIndex];
    
    // Vérifier la disponibilité
    const availableRooms = room.quantity - (room.assignedRooms || 0);
    const roomsNeeded = Math.ceil(clientIds.length / bedCount);
    
    if (roomsNeeded > availableRooms) {
      return res.status(400).json({
        success: false,
        message: `Pas assez de chambres disponibles. ${roomsNeeded} nécessaires, ${availableRooms} disponibles`
      });
    }

    // Assigner les clients
    const updateResult = await Client.updateMany(
      { _id: { $in: clientIds } },
      { 
        $set: { 
          assignedHotel: hotelId,
          status: 'Assigné',
          assignedAt: new Date(),
          roomType: roomType
        }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client n\'a pu être assigné'
      });
    }

    // Mettre à jour l'assignation
    assignment.availableRooms[roomIndex].assignedRooms = (room.assignedRooms || 0) + roomsNeeded;
    await assignment.save();
    await assignment.updateStats();

    console.log(`✅ ${updateResult.modifiedCount} clients assignés à l'hôtel`);

    res.json({
      success: true,
      message: `${updateResult.modifiedCount} client(s) assigné(s) avec succès`,
      data: {
        assignedClients: updateResult.modifiedCount,
        roomsUsed: roomsNeeded,
        roomType: roomType
      }
    });

  } catch (error) {
    console.error('Erreur assign clients to hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation',
      error: error.message
    });
  }
});

// POST /api/clients/unassign-from-hotel - Désassigner un client d'un hôtel
router.post('/unassign-from-hotel', async (req, res) => {
  try {
    const { clientId } = req.body;

    const client = await Client.findById(clientId);
    if (!client || !client.assignedHotel) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé ou non assigné'
      });
    }

    // Récupérer l'assignation pour mettre à jour les stats
    const assignment = await EventHotelAssignment.findOne({
      eventId: client.eventId,
      hotelId: client.assignedHotel
    });

    // Désassigner le client
    client.assignedHotel = null;
    client.status = 'En_attente';
    client.roomType = null;
    client.assignedAt = null;
    await client.save();

    // Mettre à jour l'assignation si trouvée
    if (assignment) {
      await assignment.updateStats();
    }

    res.json({
      success: true,
      message: 'Client désassigné avec succès'
    });

  } catch (error) {
    console.error('Erreur unassign client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la désassignation'
    });
  }
});

module.exports = router;