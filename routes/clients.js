const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

// Configuration multer pour l'upload CSV
const upload = multer({ dest: 'uploads/' });

// GET /api/clients - Récupérer tous les clients
router.get('/', async (req, res) => {
  try {
    const { search, type, status, groupName } = req.query;
    let filter = {};

    // Filtre de recherche textuelle
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { groupName: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtres spécifiques
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

// POST /api/clients - Créer un nouveau client
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, type, groupName, groupSize, notes } = req.body;

    // Validation des données
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Prénom, nom et téléphone sont requis'
      });
    }

    // Validation du type et nom de groupe
    if (type === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    // Vérifier si le téléphone existe déjà
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

    // Ajouter le nom de groupe si c'est un groupe
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

    // Validation du type et nom de groupe
    if (type === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    // Vérifier si le téléphone existe déjà (sauf pour ce client)
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

    // Gérer le nom de groupe
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

// DELETE /api/clients/all - Supprimer tous les clients (TEMPORAIRE POUR TEST)
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
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Lire le fichier CSV
    const stream = fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          console.log('📊 Données CSV reçues:', results);

          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const lineNum = i + 2; // +2 car ligne 1 = headers, index 0 = ligne 2

            try {
              // Validation des champs requis
              if (!row.prenom || !row.nom || !row.telephone) {
                errors.push(`Ligne ${lineNum}: Prénom, nom et téléphone requis`);
                continue;
              }

              // 🎯 Déterminer le type et nom de groupe
              let clientType = 'Solo';
              let clientGroupName = null;
              
              console.log(`Ligne ${lineNum} - Groupe brut: "${row.groupe}"`);
              
              // Vérifier si la colonne groupe existe et n'est pas vide
              if (row.groupe && typeof row.groupe === 'string' && row.groupe.trim() !== '') {
                const groupValue = row.groupe.trim();
                console.log(`Groupe nettoyé: "${groupValue}"`);
                
                // Si c'est explicitement "solo", garder Solo
                if (groupValue.toLowerCase() === 'solo') {
                  clientType = 'Solo';
                  clientGroupName = null;
                } else {
                  // Sinon, c'est un groupe
                  clientType = 'Groupe';
                  clientGroupName = groupValue;
                }
              }

              console.log(`🏷️ Type final: ${clientType}, Groupe: ${clientGroupName}`);

              // Vérifier si client existe déjà
              const existingClient = await Client.findOne({ phone: row.telephone.trim() });
              if (existingClient) {
                errors.push(`Ligne ${lineNum}: Client ${row.telephone} existe déjà`);
                continue;
              }

              // Déterminer la taille du groupe
              let groupSize = parseInt(row.taille_groupe) || 1;
              if (clientType === 'Solo') {
                groupSize = 1;
              } else if (groupSize < 1) {
                groupSize = 1;
              }

              // Créer le client
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

              console.log(`💾 Création client:`, clientData);

              const client = new Client(clientData);
              await client.save();
              imported++;

              console.log(`✅ Client créé: ${client.firstName} ${client.lastName} - Type: ${client.type}, Groupe: ${client.groupName}`);

            } catch (error) {
              console.error(`❌ Ligne ${lineNum}:`, error);
              errors.push(`Ligne ${lineNum}: ${error.message}`);
            }
          }

          // Supprimer le fichier temporaire
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
            errors: errors.slice(0, 20) // Limiter les erreurs affichées
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
      })
      .on('error', (error) => {
        console.error('❌ Erreur lecture CSV:', error);
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier:', unlinkError);
        }
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la lecture du fichier CSV',
          error: error.message
        });
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

// GET /api/clients/search/:query - Recherche avancée de clients
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

module.exports = router;
