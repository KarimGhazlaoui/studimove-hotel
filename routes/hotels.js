const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');
const Event = require('../models/Event');
const Client = require('../models/Client');

// GET /api/hotels - Récupérer tous les hôtels
router.get('/', async (req, res) => {
  try {
    const { eventId, search, location } = req.query;
    let filter = {};

    // Si eventId fourni, filtrer par événement
    if (eventId) {
      filter.assignedEvent = eventId;
    }

    // Autres filtres optionnels
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }

    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    const hotels = await Hotel.find(filter)
      .populate('assignedEvent', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    console.error('Erreur GET hotels:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des hôtels'
    });
  }
});

// POST /api/hotels - Créer un nouvel hôtel
router.post('/', async (req, res) => {
  try {
    const {
      eventId,
      name,
      address,
      contact,
      roomTypes,
      facilities,
      rating,
      description
    } = req.body;

    // 🆕 VALIDATION: Vérifier que l'événement existe
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'événement est requis'
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Vérifier si l'hôtel existe déjà dans cet événement
    const existingHotel = await Hotel.findOne({ 
      eventId: eventId,
      name: name.trim() 
    });
    
    if (existingHotel) {
      return res.status(400).json({
        success: false,
        message: 'Un hôtel avec ce nom existe déjà dans cet événement'
      });
    }

    const hotel = new Hotel({
      eventId,
      name: name.trim(),
      address: {
        street: address?.street || '',
        city: address?.city || event.city,
        country: address?.country || event.country,
        zipCode: address?.zipCode || '',
        coordinates: address?.coordinates || {}
      },
      contact: contact || {},
      roomTypes: roomTypes || [{ type: 'Standard', capacity: 4, quantity: 10 }],
      facilities: facilities || [],
      rating: rating || 3,
      description: description || ''
    });

    await hotel.save();

    // Mettre à jour les statistiques de l'événement
    await event.updateHotelsCount();

    res.status(201).json({
      success: true,
      message: 'Hôtel créé avec succès',
      data: hotel
    });
  } catch (error) {
    console.error('Erreur POST hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'hôtel',
      error: error.message
    });
  }
});

// GET /api/hotels/:id - Récupérer un hôtel par ID
router.get('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .populate('eventId', 'name country city startDate endDate');

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Récupérer les clients assignés
    const assignedClients = await Client.find({ 
      assignedHotel: hotel._id,
      eventId: hotel.eventId 
    }).select('firstName lastName gender clientType groupName status roomAssignment');

    const hotelData = hotel.toObject();
    hotelData.assignedClients = assignedClients;

    res.json({
      success: true,
      data: hotelData
    });
  } catch (error) {
    console.error('Erreur GET hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'hôtel'
    });
  }
});

// PUT /api/hotels/:id - Mettre à jour un hôtel
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      address,
      contact,
      roomTypes,
      facilities,
      rating,
      description,
      status
    } = req.body;

    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Vérifier si le nom existe déjà dans le même événement
    if (name && name !== hotel.name) {
      const existingHotel = await Hotel.findOne({ 
        eventId: hotel.eventId,
        name: name.trim(),
        _id: { $ne: req.params.id }
      });
      
      if (existingHotel) {
        return res.status(400).json({
          success: false,
          message: 'Un autre hôtel avec ce nom existe déjà dans cet événement'
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (address) updateData.address = { ...hotel.address, ...address };
    if (contact) updateData.contact = { ...hotel.contact, ...contact };
    if (roomTypes) updateData.roomTypes = roomTypes;
    if (facilities) updateData.facilities = facilities;
    if (rating) updateData.rating = rating;
    if (description !== undefined) updateData.description = description;
    if (status) updateData.status = status;

    const updatedHotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('eventId', 'name country city');

    res.json({
      success: true,
      message: 'Hôtel mis à jour avec succès',
      data: updatedHotel
    });
  } catch (error) {
    console.error('Erreur PUT hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de l\'hôtel',
      error: error.message
    });
  }
});

// DELETE /api/hotels/:id - Supprimer un hôtel
router.delete('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Vérifier s'il y a des clients assignés
    const assignedClientsCount = await Client.countDocuments({ 
      assignedHotel: req.params.id,
      eventId: hotel.eventId 
    });

    if (assignedClientsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer l'hôtel. ${assignedClientsCount} client(s) y sont assignés. Réassignez-les d'abord.`
      });
    }

    await Hotel.findByIdAndDelete(req.params.id);

    // Mettre à jour les statistiques de l'événement
    const event = await Event.findById(hotel.eventId);
    if (event) {
      await event.updateHotelsCount();
    }

    res.json({
      success: true,
      message: 'Hôtel supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur DELETE hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'hôtel'
    });
  }
});

// GET /api/hotels/:id/rooms - Récupérer les chambres détaillées
router.get('/:id/rooms', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hôtel non trouvé'
      });
    }

    // Récupérer les clients assignés avec leurs chambres
    const assignedClients = await Client.find({ 
      assignedHotel: hotel._id,
      eventId: hotel.eventId,
      'roomAssignment.roomId': { $exists: true }
    }).select('firstName lastName gender clientType groupName roomAssignment');

    // Organiser par chambres
    const roomsData = {};
    
    assignedClients.forEach(client => {
      const roomId = client.roomAssignment.roomId;
      if (!roomsData[roomId]) {
        roomsData[roomId] = {
          roomId: roomId,
          roomType: client.roomAssignment.roomType,
          capacity: client.roomAssignment.roomCapacity,
          occupants: [],
          remainingCapacity: client.roomAssignment.roomCapacity
        };
      }
      
      roomsData[roomId].occupants.push({
        id: client._id,
        name: client.fullName,
        gender: client.gender,
        clientType: client.clientType,
        groupName: client.groupName
      });
      
      roomsData[roomId].remainingCapacity--;
    });

    const rooms = Object.values(roomsData);

    res.json({
      success: true,
      hotel: {
        id: hotel._id,
        name: hotel.name,
        totalRooms: hotel.totalRooms,
        totalCapacity: hotel.totalCapacity
      },
      assignedRooms: rooms.length,
      data: rooms
    });
  } catch (error) {
    console.error('Erreur GET hotel rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des chambres'
    });
  }
});

module.exports = router;
