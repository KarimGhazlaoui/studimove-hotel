const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');
const Client = require('../models/Client');

// GET /api/dashboard/stats - Statistiques du dashboard
router.get('/stats', async (req, res) => {
  try {
    const [
      totalHotels,
      totalClients,
      activeEvents,
      assignedRooms
    ] = await Promise.all([
      Hotel.countDocuments(),
      Client.countDocuments(),
      // Pour l'instant, simulé car pas encore de modèle Event
      Promise.resolve(5),
      // Calculé depuis les clients assignés
      Client.countDocuments({ assignedHotel: { $ne: null } })
    ]);

    // Calculs de tendances (simulés pour l'exemple)
    const trends = {
      weeklyBookings: 15,
      occupancyRate: 78,
      newClients: 12,
      satisfaction: 4.3
    };

    res.json({
      success: true,
      stats: {
        totalHotels,
        totalClients,
        activeEvents,
        assignedRooms,
        trends
      }
    });
  } catch (error) {
    console.error('Erreur stats dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du calcul des statistiques'
    });
  }
});

// GET /api/dashboard/activity - Activité récente
router.get('/activity', async (req, res) => {
  try {
    // Simulé pour l'exemple - à remplacer par de vraies données
    const activities = [
      {
        type: 'hotel',
        description: 'Nouvel hôtel ajouté: Hotel Central',
        timeAgo: 'Il y a 2 heures'
      },
      {
        type: 'client',
        description: '15 nouveaux clients importés via CSV',
        timeAgo: 'Il y a 4 heures'
      },
      {
        type: 'assignment',
        description: 'Assignation automatique terminée pour Event Paris',
        timeAgo: 'Il y a 6 heures'
      },
      {
        type: 'event',
        description: 'Nouvel événement créé: StudiMove Lyon 2024',
        timeAgo: 'Il y a 1 jour'
      }
    ];

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Erreur activité dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'activité'
    });
  }
});

module.exports = router;