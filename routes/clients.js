const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

// Configuration multer pour l'upload CSV
const upload = multer({ dest: 'uploads/' });

// 🎯 ROUTES SPÉCIFIQUES EN PREMIER (avant /:id)
// GET /api/clients/groups - Récupérer les groupes
router.get('/groups', async (req, res) => {
  try {
    const groups = await Client.aggregate([
      { $match: { type: 'Groupe', groupName: { $ne: null } } },
      {
        $group: {
          _id: '$groupName',
          count: { $sum: 1 },
          totalSize: { $sum: '$groupSize' },
          status: { $first: '$status' },
          assignedHotel: { $first: '$assignedHotel' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      count: groups.length,
      data: groups
    });
  } catch (error) {
    console.error('Erreur GET groups:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des groupes'
    });
  }
});

// GET /api/clients/stats - Obtenir les statistiques des clients
router.get('/stats', async (req, res) => {
  try {
    const stats = await Client.aggregate([
      {
        $group: {
          _id: null,
          totalClients: { $sum: 1 },
          soloClients: { $sum: { $cond: [{ $eq: ['$type', 'Solo'] }, 1, 0] } },
          groupClients: { $sum: { $cond: [{ $eq: ['$type', 'Groupe'] }, 1, 0] } },
          totalGroupSize: { $sum: '$groupSize' },
          enAttente: { $sum: { $cond: [{ $eq: ['$status', 'En attente'] }, 1, 0] } },
          assigne: { $sum: { $cond: [{ $eq: ['$status', 'Assigné'] }, 1, 0] } },
          confirme: { $sum: { $cond: [{ $eq: ['$status', 'Confirmé'] }, 1, 0] } },
          annule: { $sum: { $cond: [{ $eq: ['$status', 'Annulé'] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || {
      totalClients: 0,
      soloClients: 0,
      groupClients: 0,
      totalGroupSize: 0,
      enAttente: 0,
      assigne: 0,
      confirme: 0,
      annule: 0
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erreur stats clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des statistiques'
    });
  }
});

// POST /api/clients/import-csv - Importer des clients depuis un CSV
router.post('/import-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier CSV fourni'
      });
    }

    const results = [];
    const errors = [];
    let imported = 0;

    const stream = fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          console.log('📊 Données CSV reçues:', results);

          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const lineNum = i + 2;

            try {
              if (!row.prenom || !row.nom || !row.telephone) {
                errors.push(`Ligne ${lineNum}: Prénom, nom et téléphone requis`);
                continue;
              }

              let clientType = 'Solo';
              let clientGroupName = null;
              
              if (row.groupe && typeof row.groupe === 'string' && row.groupe.trim() !== '') {
                const groupValue = row.groupe.trim();
                if (groupValue.toLowerCase() === 'solo') {
                  clientType = 'Solo';
                  clientGroupName = null;
                } else {
                  clientType = 'Groupe';
                  clientGroupName = groupValue;
                }
              }

              const existingClient = await Client.findOne({ phone: row.telephone.trim() });
              if (existingClient) {
                errors.push(`Ligne ${lineNum}: Client ${row.telephone} existe déjà`);
                continue;
              }

              let groupSize = parseInt(row.taille_groupe) || 1;
              if (clientType === 'Solo') {
                groupSize = 1;
              }

              const clientData = {
                firstName: row.prenom.trim(),
                lastName: row.nom.trim(),
                phone: row.telephone.trim(),
                type: clientType,
                groupName: clientGroupName,
                groupSize: groupSize,
                notes: row.notes ? row.notes.trim() : '',
                status: 'En attente'
              };

              const client = new Client(clientData);
              await client.save();
              imported++;

            } catch (error) {
              errors.push(`Ligne ${lineNum}: ${error.message}`);
            }
          }

          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('Erreur suppression fichier temporaire:', unlinkError);
          }

          res.json({
            success: true,
            message: `Import terminé: ${imported} clients importés, ${errors.length} erreurs`,
            imported,
            totalProcessed: results.length,
            errors: errors.slice(0, 20)
          });

        } catch (error) {
          console.error('❌ Erreur traitement CSV:', error);
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('Erreur suppression fichier:', unlinkError);
          }
          res.status(500).json({
            success: false,
            message: 'Erreur lors du traitement du fichier CSV',
            error: error.message
          });
        }
      });

  } catch (error) {
    console.error('❌ Erreur import CSV:', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Erreur suppression fichier:', unlinkError);
      }
    }
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'import CSV',
      error: error.message
    });
  }
});

// POST /api/clients/assign-hotel - Assigner un hôtel à un client
router.post('/assign-hotel', async (req, res) => {
  try {
    const { clientId, hotelId } = req.body;

    if (!clientId || !hotelId) {
      return res.status(400).json({
        success: false,
        message: 'ID client et ID hôtel requis'
      });
    }

    const client = await Client.findByIdAndUpdate(
      clientId,
      { 
        assignedHotel: hotelId,
        status: 'Assigné'
      },
      { new: true }
    ).populate('assignedHotel', 'name address');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Hôtel assigné avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur assignation hôtel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation de l\'hôtel'
    });
  }
});

// 🚨 DELETE /all - DOIT ÊTRE AVANT /:id
router.delete('/all', async (req, res) => {
  try {
    console.log('🗑️ Suppression de tous les clients...');
    const result = await Client.deleteMany({});
    console.log(`✅ ${result.deletedCount} clients supprimés`);
    
    res.json({
      success: true,
      message: `${result.deletedCount} clients supprimés avec succès`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Erreur suppression tous clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de tous les clients',
      error: error.message
    });
  }
});

// GET /api/clients/search/:query - Recherche avancée
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const clients = await Client.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { groupName: { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } }
      ]
    })
    .populate('assignedHotel', 'name address')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({
      success: true,
      count: clients.length,
      query: query,
      data: clients
    });
  } catch (error) {
    console.error('Erreur recherche clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche'
    });
  }
});

// 🎯 ROUTES GÉNÉRALES APRÈS LES SPÉCIFIQUES
// GET /api/clients - Récupérer tous les clients
router.get('/', async (req, res) => {
  try {
    const { search, type, status, groupName } = req.query;
    let filter = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { groupName: { $regex: search, $options: 'i' } }
      ];
    }

    if (type && type !== 'all') filter.type = type;
    if (status && status !== 'all') filter.status = status;
    if (groupName) filter.groupName = groupName;

    const clients = await Client.find(filter)
      .populate('assignedHotel', 'name address')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: clients.length,
      data: clients
    });
  } catch (error) {
    console.error('Erreur GET clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des clients'
    });
  }
});

// POST /api/clients - Créer un nouveau client
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, type, groupName, groupSize, notes } = req.body;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Prénom, nom et téléphone sont requis'
      });
    }

    if (type === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    const existingClient = await Client.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Un client avec ce numéro de téléphone existe déjà'
      });
    }

    const clientData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      type: type || 'Solo',
      groupSize: parseInt(groupSize) || 1,
      notes: notes || ''
    };

    if (type === 'Groupe' && groupName) {
      clientData.groupName = groupName.trim();
    }

    const client = new Client(clientData);
    await client.save();

    res.status(201).json({
      success: true,
      message: 'Client créé avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur POST client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du client'
    });
  }
});

// 🎯 ROUTES AVEC PARAMÈTRES EN DERNIER
// GET /api/clients/:id - Récupérer un client par ID
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('assignedHotel', 'name address');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Erreur GET client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du client'
    });
  }
});

// PUT /api/clients/:id - Mettre à jour un client
router.put('/:id', async (req, res) => {
  try {
    const { firstName, lastName, phone, type, groupName, groupSize, notes } = req.body;

    if (type === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    const existingClient = await Client.findOne({ 
      phone: phone.trim(), 
      _id: { $ne: req.params.id } 
    });
    
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Un autre client avec ce numéro de téléphone existe déjà'
      });
    }

    const updateData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      type: type || 'Solo',
      groupSize: parseInt(groupSize) || 1,
      notes: notes || ''
    };

    if (type === 'Groupe' && groupName) {
      updateData.groupName = groupName.trim();
    } else {
      updateData.groupName = null;
    }

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Client mis à jour avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur PUT client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du client'
    });
  }
});

// PUT /api/clients/:id/status - Mettre à jour le statut d'un client
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['En attente', 'Assigné', 'Confirmé', 'Annulé'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide. Valeurs acceptées: ' + validStatuses.join(', ')
      });
    }

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('assignedHotel', 'name address');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur mise à jour statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut'
    });
  }
});

// DELETE /api/clients/:id - Supprimer un client
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Client supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur DELETE client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du client'
    });
  }
});

module.exports = router;
