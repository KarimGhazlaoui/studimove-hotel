const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Hotel = require('../models/Hotel');
const Client = require('../models/Client');

// GET /api/events - Récupérer tous les événements
router.get('/', async (req, res) => {
  try {
    const { status, active } = req.query;
    let filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (active === 'true') {
      const now = new Date();
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
      filter.status = 'Active';
    }

    const events = await Event.find(filter)
      .sort({ startDate: -1 })
      .lean();

    // Ajouter les statistiques
    for (let event of events) {
      const [hotelCount, clientCount, roomsAgg] = await Promise.all([
        Hotel.countDocuments({ eventId: event._id }),
        Client.countDocuments({ eventId: event._id }),
        Hotel.aggregate([
          { $match: { eventId: event._id } },
          { $unwind: '$roomTypes' },
          { $group: { _id: null, totalRooms: { $sum: '$roomTypes.quantity' } } }
        ])
      ]);

      event.totalHotels = hotelCount;
      event.currentParticipants = clientCount;
      event.totalRooms = roomsAgg.length > 0 ? roomsAgg[0].totalRooms : 0;
    }

    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Erreur GET events:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des événements'
    });
  }
});

// GET /api/events/active - Événements actifs uniquement
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const events = await Event.find({
      status: 'Active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ startDate: 1 });

    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Erreur GET active events:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des événements actifs'
    });
  }
});

// POST /api/events - Créer un nouvel événement
router.post('/', async (req, res) => {
  try {
    const {
      name,
      country,
      city,
      startDate,
      endDate,
      description,
      maxParticipants,
      allowMixedGroups,
      vipPrice
    } = req.body;

    // Validation des dates
    if (startDate && endDate) {
      console.log('🔍 POST - Dates reçues:');
      console.log('- startDate brut:', startDate);
      console.log('- endDate brut:', endDate);
      
      // Créer les dates à midi UTC pour éviter les problèmes de timezone
      const start = new Date(startDate + 'T12:00:00.000Z');
      const end = new Date(endDate + 'T12:00:00.000Z');
      
      console.log('- Date début:', start.toISOString());
      console.log('- Date fin:', end.toISOString());
      console.log('- Fin > Début ?', end > start);
      
      if (start >= end) {
        return res.status(400).json({
          success: false,
          message: 'La date de fin doit être après la date de début'
        });
      }
    }

    // Vérifier si l'événement existe déjà
    const existingEvent = await Event.findOne({ name: name.trim() });
    if (existingEvent) {
      return res.status(400).json({
        success: false,
        message: 'Un événement avec ce nom existe déjà'
      });
    }

    const event = new Event({
      name: name.trim(),
      country: country.trim(),
      city: city.trim(),
      startDate: new Date(startDate + 'T00:00:00.000Z'),
      endDate: new Date(endDate + 'T23:59:59.000Z'),
      description: description ? description.trim() : '',
      maxParticipants: maxParticipants || null,
      allowMixedGroups: allowMixedGroups || false,
      vipPrice: vipPrice || 0
    });

    await event.save();

    res.status(201).json({
      success: true,
      message: 'Événement créé avec succès',
      data: event
    });
  } catch (error) {
    console.error('Erreur POST event:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'événement',
      error: error.message
    });
  }
});

// GET /api/events/:id - Récupérer un événement par ID
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Récupérer les statistiques détaillées
    const [hotels, clientStats] = await Promise.all([
      Hotel.find({ eventId: event._id }).select('name roomTypes'),
      Client.aggregate([
        { $match: { eventId: event._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            vip: { $sum: { $cond: [{ $eq: ['$clientType', 'VIP'] }, 1, 0] } },
            staff: { $sum: { $cond: [{ $eq: ['$clientType', 'Staff'] }, 1, 0] } },
            influenceurs: { $sum: { $cond: [{ $eq: ['$clientType', 'Influenceur'] }, 1, 0] } },
            groupes: { $sum: { $cond: [{ $eq: ['$clientType', 'Groupe'] }, 1, 0] } },
            solos: { $sum: { $cond: [{ $eq: ['$clientType', 'Solo'] }, 1, 0] } },
            hommes: { $sum: { $cond: [{ $eq: ['$gender', 'Homme'] }, 1, 0] } },
            femmes: { $sum: { $cond: [{ $eq: ['$gender', 'Femme'] }, 1, 0] } }
          }
        }
      ])
    ]);

    const eventData = event.toObject();
    eventData.hotels = hotels;
    eventData.clientStats = clientStats[0] || {
      total: 0, vip: 0, staff: 0, influenceurs: 0, groupes: 0, solos: 0, hommes: 0, femmes: 0
    };

    res.json({
      success: true,
      data: eventData
    });
  } catch (error) {
    console.error('Erreur GET event:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'événement'
    });
  }
});

// PUT /api/events/:id - Mettre à jour un événement
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      country,
      city,
      startDate,
      endDate,
      description,
      status,
      maxParticipants,
      allowMixedGroups,
      vipPrice
    } = req.body;

    // Validation des dates
    if (startDate && endDate) {
      console.log('🔍 PUT - Dates reçues:');
      console.log('- startDate brut:', startDate);
      console.log('- endDate brut:', endDate);
      
      // Créer les dates à midi UTC pour éviter les problèmes de timezone
      const start = new Date(startDate + 'T12:00:00.000Z');
      const end = new Date(endDate + 'T12:00:00.000Z');
      
      console.log('- Date début:', start.toISOString());
      console.log('- Date fin:', end.toISOString());  
      console.log('- Fin > Début ?', end > start);
      
      if (start >= end) {
        return res.status(400).json({
          success: false,
          message: 'La date de fin doit être après la date de début'
        });
      }
    }

    // Vérifier si le nom existe déjà (sauf pour cet événement)
    if (name) {
      const existingEvent = await Event.findOne({ 
        name: name.trim(), 
        _id: { $ne: req.params.id } 
      });
      
      if (existingEvent) {
        return res.status(400).json({
          success: false,
          message: 'Un autre événement avec ce nom existe déjà'
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (country) updateData.country = country.trim();
    if (city) updateData.city = city.trim();
    if (startDate) updateData.startDate = new Date(startDate + 'T00:00:00.000Z');
    if (endDate) updateData.endDate = new Date(endDate + 'T23:59:59.000Z');
    if (description !== undefined) updateData.description = description.trim();
    if (status) updateData.status = status;
    if (maxParticipants !== undefined) updateData.maxParticipants = maxParticipants || null;
    if (allowMixedGroups !== undefined) updateData.allowMixedGroups = allowMixedGroups;
    if (vipPrice !== undefined) updateData.vipPrice = vipPrice || 0;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Événement mis à jour avec succès',
      data: event
    });
  } catch (error) {
    console.error('Erreur PUT event:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de l\'événement',
      error: error.message
    });
  }
});

// PUT /api/events/:id/status - Mettre à jour le statut uniquement
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['Planification', 'Active', 'Terminé', 'Annulé'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide. Valeurs acceptées: ' + validStatuses.join(', ')
      });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      data: event
    });
  } catch (error) {
    console.error('Erreur PUT event status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut'
    });
  }
});

// DELETE /api/events/:id - Supprimer un événement
router.delete('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Vérifier s'il y a des hôtels ou clients associés
    const [hotelCount, clientCount] = await Promise.all([
      Hotel.countDocuments({ eventId: req.params.id }),
      Client.countDocuments({ eventId: req.params.id })
    ]);

    if (hotelCount > 0 || clientCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer l'événement. Il contient ${hotelCount} hôtel(s) et ${clientCount} client(s). Supprimez d'abord les données associées.`
      });
    }

    await Event.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Événement supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur DELETE event:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'événement'
    });
  }
});

// DELETE /api/events/:id/force - Supprimer avec toutes les données associées
router.delete('/:id/force', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Supprimer toutes les données associées
    const [deletedClients, deletedHotels] = await Promise.all([
      Client.deleteMany({ eventId: req.params.id }),
      Hotel.deleteMany({ eventId: req.params.id })
    ]);

    // Supprimer l'événement
    await Event.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `Événement supprimé avec succès avec ${deletedClients.deletedCount} client(s) et ${deletedHotels.deletedCount} hôtel(s)`,
      deletedData: {
        clients: deletedClients.deletedCount,
        hotels: deletedHotels.deletedCount
      }
    });
  } catch (error) {
    console.error('Erreur DELETE event force:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression forcée de l\'événement'
    });
  }
});

// GET /api/events/:id/stats - Statistiques détaillées
router.get('/:id/stats', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Statistiques détaillées
    const [hotelStats, clientStats, roomStats] = await Promise.all([
      // Statistiques hôtels
      Hotel.aggregate([
        { $match: { eventId: event._id } },
        {
          $group: {
            _id: null,
            totalHotels: { $sum: 1 },
            avgRating: { $avg: '$rating' },
            cities: { $addToSet: '$address.city' }
          }
        }
      ]),
      
      // Statistiques clients
      Client.aggregate([
        { $match: { eventId: event._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            byType: {
              $push: {
                type: '$clientType',
                gender: '$gender',
                status: '$status'
              }
            }
          }
        }
      ]),
      
      // Statistiques chambres
      Hotel.aggregate([
        { $match: { eventId: event._id } },
        { $unwind: '$roomTypes' },
        {
          $group: {
            _id: null,
            totalRooms: { $sum: '$roomTypes.quantity' },
            totalCapacity: { $sum: { $multiply: ['$roomTypes.quantity', '$roomTypes.capacity'] } },
            avgCapacity: { $avg: '$roomTypes.capacity' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        event: event,
        hotels: hotelStats[0] || { totalHotels: 0, avgRating: 0, cities: [] },
        clients: clientStats[0] || { total: 0, byType: [] },
        rooms: roomStats[0] || { totalRooms: 0, totalCapacity: 0, avgCapacity: 0 }
      }
    });
  } catch (error) {
    console.error('Erreur GET event stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;