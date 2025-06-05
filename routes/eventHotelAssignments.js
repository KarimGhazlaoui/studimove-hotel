const express = require('express');
const router = express.Router();
const EventHotelAssignment = require('../models/EventHotelAssignment');
const Event = require('../models/Event');
const Hotel = require('../models/Hotel');

// GET /api/assignments/event/:eventId - Récupérer les hôtels assignés à un événement
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const assignments = await EventHotelAssignment.find({ eventId })
      .populate('hotelId', 'name address phone rating')
      .populate('eventId', 'name city country')
      .sort({ 'hotelId.name': 1 });

    // Calculer les statistiques globales
    const stats = {
      totalHotels: assignments.length,
      totalCapacity: assignments.reduce((sum, a) => sum + a.totalCapacity, 0),
      totalAssigned: assignments.reduce((sum, a) => sum + a.totalAssigned, 0),
      availableCapacity: assignments.reduce((sum, a) => sum + (a.totalCapacity - a.totalAssigned), 0)
    };

    res.json({
      success: true,
      data: {
        assignments,
        stats
      }
    });
  } catch (error) {
    console.error('Erreur GET assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des assignations'
    });
  }
});

// GET /api/assignments/available-hotels/:eventId - Récupérer les hôtels non assignés
router.get('/available-hotels/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Récupérer les hôtels déjà assignés
    const assignedHotels = await EventHotelAssignment.find({ eventId })
      .select('hotelId');
    const assignedHotelIds = assignedHotels.map(a => a.hotelId);
    
    // Récupérer les hôtels disponibles
    const availableHotels = await Hotel.find({
      _id: { $nin: assignedHotelIds }
    }).sort({ name: 1 });

    res.json({
      success: true,
      data: availableHotels
    });
  } catch (error) {
    console.error('Erreur GET available hotels:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des hôtels disponibles'
    });
  }
});

// POST /api/assignments - Assigner un hôtel à un événement
router.post('/', async (req, res) => {
  try {
    const { eventId, hotelId, availableRooms, notes } = req.body;

    // Vérifications
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Vérifier si l'assignation existe déjà
    const existingAssignment = await EventHotelAssignment.findOne({
      eventId,
      hotelId
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Cet hôtel est déjà assigné à cet événement'
      });
    }

    // Validation des chambres
    if (!availableRooms || availableRooms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Au moins un type de chambre est requis'
      });
    }

    // Créer l'assignation
    const assignment = new EventHotelAssignment({
      eventId,
      hotelId,
      availableRooms: availableRooms.map(room => ({
        bedCount: parseInt(room.bedCount),
        quantity: parseInt(room.quantity),
        pricePerNight: parseFloat(room.pricePerNight) || 0,
        assignedRooms: 0
      })),
      notes: notes || ''
    });

    await assignment.save();

    // Mettre à jour les statistiques de l'événement
    await event.updateHotelsCount();

    console.log(`✅ Hôtel ${hotel.name} assigné à l'événement ${event.name}`);

    const populatedAssignment = await EventHotelAssignment.findById(assignment._id)
      .populate('hotelId', 'name address phone rating')
      .populate('eventId', 'name city country');

    res.status(201).json({
      success: true,
      message: 'Hôtel assigné avec succès',
      data: populatedAssignment
    });
  } catch (error) {
    console.error('Erreur POST assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation',
      error: error.message
    });
  }
});

// PUT /api/assignments/:id - Modifier une assignation
router.put('/:id', async (req, res) => {
  try {
    const { availableRooms, notes, status } = req.body;

    const assignment = await EventHotelAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    // Mise à jour
    if (availableRooms) {
      assignment.availableRooms = availableRooms.map(room => ({
        bedCount: parseInt(room.bedCount),
        quantity: parseInt(room.quantity),
        pricePerNight: parseFloat(room.pricePerNight) || 0,
        assignedRooms: parseInt(room.assignedRooms) || 0
      }));
    }

    if (notes !== undefined) assignment.notes = notes;
    if (status) assignment.status = status;

    await assignment.save();
    await assignment.updateStats();

    const updatedAssignment = await EventHotelAssignment.findById(assignment._id)
      .populate('hotelId', 'name address phone rating')
      .populate('eventId', 'name city country');

    res.json({
      success: true,
      message: 'Assignation mise à jour avec succès',
      data: updatedAssignment
    });
  } catch (error) {
    console.error('Erreur PUT assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour',
      error: error.message
    });
  }
});

// DELETE /api/assignments/:id - Supprimer une assignation
router.delete('/:id', async (req, res) => {
  try {
    const assignment = await EventHotelAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignation non trouvée'
      });
    }

    await EventHotelAssignment.findByIdAndDelete(req.params.id);

    // Mettre à jour les statistiques de l'événement
    const event = await Event.findById(assignment.eventId);
    if (event) {
      await event.updateHotelsCount();
    }

    res.json({
      success: true,
      message: 'Assignation supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur DELETE assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression'
    });
  }
});

module.exports = router;