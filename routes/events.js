const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Hotel = require('../models/Hotel');
const Client = require('../models/Client');

// ✅ Fonction helper pour créer une date valide
const createSafeDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Si c'est déjà au format ISO complet, l'utiliser directement
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // Sinon, c'est au format YYYY-MM-DD, ajouter l'heure
  return new Date(dateStr + 'T12:00:00.000Z');
};

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

    console.log('🔍 POST - Données reçues:', req.body);

    // Validation des champs requis
    if (!name || !country || !city || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Nom, pays, ville et dates sont requis'
      });
    }

    // ✅ Validation des dates avec la fonction helper
    if (startDate && endDate) {
      console.log('🔍 POST - Dates reçues:');
      console.log('- startDate brut:', startDate);
      console.log('- endDate brut:', endDate);
      
      const start = createSafeDate(startDate);
      const end = createSafeDate(endDate);
      
      console.log('- Date début:', start ? start.toISOString() : 'INVALIDE');
      console.log('- Date fin:', end ? end.toISOString() : 'INVALIDE');
      
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Format de date invalide'
        });
      }
      
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

    // ✅ Créer l'événement avec gestion intelligente des dates
    const event = new Event({
      name: name.trim(),
      country: country.trim(),
      city: city.trim(),
      startDate: startDate.includes('T') ? new Date(startDate) : new Date(startDate + 'T00:00:00.000Z'),
      endDate: endDate.includes('T') ? new Date(endDate) : new Date(endDate + 'T23:59:59.000Z'),
      description: description ? description.trim() : '',
      maxParticipants: maxParticipants || null,
      allowMixedGroups: allowMixedGroups || false,
      vipPrice: vipPrice || 0
    });

    await event.save();

    console.log('✅ Événement créé:', event);

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

    console.log('🔍 PUT - Données reçues:', req.body);

    // ✅ Validation des dates avec la fonction helper
    if (startDate && endDate) {
      console.log('🔍 PUT - Dates reçues:');
      console.log('- startDate brut:', startDate);
      console.log('- endDate brut:', endDate);
      
      const start = createSafeDate(startDate);
      const end = createSafeDate(endDate);
      
      console.log('- Date début:', start ? start.toISOString() : 'INVALIDE');
      console.log('- Date fin:', end ? end.toISOString() : 'INVALIDE');
      
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Format de date invalide'
        });
      }
      
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
    
    // ✅ Gestion intelligente des dates
    if (startDate) updateData.startDate = startDate.includes('T') ? new Date(startDate) : new Date(startDate + 'T00:00:00.000Z');
    if (endDate) updateData.endDate = endDate.includes('T') ? new Date(endDate) : new Date(endDate + 'T23:59:59.000Z');
    
    if (description !== undefined) updateData.description = description.trim();
    if (status) updateData.status = status;
    if (maxParticipants !== undefined) updateData.maxParticipants = maxParticipants || null;
    if (allowMixedGroups !== undefined) updateData.allowMixedGroups = allowMixedGroups;
    if (vipPrice !== undefined) updateData.vipPrice = vipPrice || 0;

    console.log('🔍 Données de mise à jour:', updateData);

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

    console.log('✅ Événement mis à jour:', event);

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

    console.log(`🗑️ Suppression forcée de l'événement: ${event.name}`);

    // Supprimer toutes les données associées
    const [deletedClients, deletedHotels] = await Promise.all([
      Client.deleteMany({ eventId: req.params.id }),
      Hotel.deleteMany({ eventId: req.params.id })
    ]);

    // Supprimer l'événement
    await Event.findByIdAndDelete(req.params.id);

    console.log(`✅ Suppression forcée terminée: ${deletedClients.deletedCount} clients, ${deletedHotels.deletedCount} hôtels`);

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

// GET /api/events/:id/assignments - Récupérer les assignations d'un événement
router.get('/:id/assignments', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Récupérer tous les clients avec leurs hôtels assignés
    const clients = await Client.find({ eventId: req.params.id })
      .populate('assignedHotel', 'name address rating')
      .sort({ lastName: 1, firstName: 1 });

    // Récupérer tous les hôtels de l'événement
    const hotels = await Hotel.find({ eventId: req.params.id })
      .sort({ name: 1 });

    // Statistiques d'assignation
    const assignedCount = clients.filter(c => c.assignedHotel).length;
    const unassignedCount = clients.length - assignedCount;

    res.json({
      success: true,
      data: {
        event: {
          _id: event._id,
          name: event.name,
          city: event.city,
          country: event.country
        },
        clients: clients,
        hotels: hotels,
        stats: {
          totalClients: clients.length,
          assigned: assignedCount,
          unassigned: unassignedCount,
          assignmentRate: clients.length > 0 ? Math.round((assignedCount / clients.length) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('Erreur GET event assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des assignations'
    });
  }
});

// POST /api/events/:id/assign - Assigner des clients à des hôtels
router.post('/:id/assign', async (req, res) => {
  try {
    const { assignments } = req.body; // Array of { clientId, hotelId }
    
    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        message: 'Le tableau des assignations est requis'
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log(`🏨 Traitement de ${assignments.length} assignations pour l'événement: ${event.name}`);

    for (let assignment of assignments) {
      try {
        const { clientId, hotelId } = assignment;

        // Vérifier que le client existe et appartient à cet événement
        const client = await Client.findOne({ 
          _id: clientId, 
          eventId: req.params.id 
        });

        if (!client) {
          errors.push(`Client ${clientId} non trouvé dans cet événement`);
          errorCount++;
          continue;
        }

        // Vérifier que l'hôtel existe et appartient à cet événement
        const hotel = await Hotel.findOne({ 
          _id: hotelId, 
          eventId: req.params.id 
        });

        if (!hotel) {
          errors.push(`Hôtel ${hotelId} non trouvé dans cet événement`);
          errorCount++;
          continue;
        }

        // Assigner le client à l'hôtel
        await Client.findByIdAndUpdate(clientId, { 
          assignedHotel: hotelId,
          status: 'Assigné'
        });

        successCount++;

      } catch (error) {
        console.error(`Erreur assignation ${assignment.clientId}:`, error);
        errors.push(`Erreur pour client ${assignment.clientId}: ${error.message}`);
        errorCount++;
      }
    }

    // Mettre à jour les statistiques des hôtels
    const uniqueHotels = [...new Set(assignments.map(a => a.hotelId))];
    for (let hotelId of uniqueHotels) {
      const hotel = await Hotel.findById(hotelId);
      if (hotel && hotel.updateAssignedClients) {
        await hotel.updateAssignedClients();
      }
    }

    console.log(`✅ Assignations terminées: ${successCount} succès, ${errorCount} erreurs`);

    res.json({
      success: true,
      message: `Assignations terminées: ${successCount} succès, ${errorCount} erreurs`,
      data: {
        successCount,
        errorCount,
        errors: errors.slice(0, 10) // Limiter les erreurs affichées
      }
    });

  } catch (error) {
    console.error('Erreur POST event assign:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors des assignations',
      error: error.message
    });
  }
});

module.exports = router;
