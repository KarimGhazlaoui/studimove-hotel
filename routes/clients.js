const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Event = require('../models/Event');
const Hotel = require('../models/Hotel');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');

// Configuration multer pour l'upload CSV
const upload = multer({ dest: 'uploads/' });

// GET /api/clients - Récupérer tous les clients (avec filtre par événement)
router.get('/', async (req, res) => {
  try {
    const { eventId, search, clientType, status, gender, groupName } = req.query;
    let filter = {};

    // 🆕 OBLIGATOIRE: Filtrer par événement
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'événement est requis'
      });
    }

    filter.eventId = eventId;

    // Autres filtres
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { groupName: { $regex: search, $options: 'i' } }
      ];
    }

    if (clientType && clientType !== 'all') filter.clientType = clientType;
    if (status && status !== 'all') filter.status = status;
    if (gender && gender !== 'all') filter.gender = gender;
    if (groupName) filter.groupName = groupName;

    const clients = await Client.find(filter)
      .populate('assignedHotel', 'name address')
      .populate('eventId', 'name country city')
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

// GET /api/clients/groups - Récupérer les groupes par événement
router.get('/groups', async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'événement est requis'
      });
    }

    const groups = await Client.aggregate([
      { 
        $match: { 
          eventId: mongoose.Types.ObjectId(eventId),
          clientType: 'Groupe', 
          groupName: { $ne: null } 
        } 
      },
      {
        $group: {
          _id: '$groupName',
          count: { $sum: 1 },
          totalSize: { $sum: '$groupSize' },
          genders: { $addToSet: '$gender' },
          status: { $first: '$status' },
          assignedHotel: { $first: '$assignedHotel' },
          members: {
            $push: {
              id: '$_id',
              name: { $concat: ['$firstName', ' ', '$lastName'] },
              gender: '$gender',
              phone: '$phone'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Enrichir avec les informations sur la mixité
    const enrichedGroups = groups.map(group => ({
      ...group,
      isMixed: group.genders.length > 1,
      needsVIP: group.genders.length > 1, // Groupe mixte doit être VIP
      canBeSeparated: group.genders.length > 1 && group.count > 1
    }));

    res.json({
      success: true,
      count: enrichedGroups.length,
      data: enrichedGroups
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
    const {
      eventId,
      firstName,
      lastName,
      phone,
      email,
      gender,
      clientType,
      groupName,
      groupSize,
      groupRelation,
      preferences,
      notes
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

    // Validation des données
    if (!firstName || !lastName || !phone || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Prénom, nom, téléphone et sexe sont requis'
      });
    }

    // Validation du type et nom de groupe
    if (clientType === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    // 🆕 Vérification d'unicité par événement (pas globale)
    const existingClient = await Client.findOne({ 
      eventId: eventId,
      phone: phone.trim() 
    });
    
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Un client avec ce numéro de téléphone existe déjà dans cet événement'
      });
    }

    const clientData = {
      eventId: eventId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      gender: gender,
      clientType: clientType || 'Standard',
      groupSize: parseInt(groupSize) || 1,
      groupRelation: groupRelation || 'Amis',
      preferences: preferences || {},
      notes: notes || '',
      source: 'Manuel'
    };

    // Ajouter le nom de groupe si c'est un groupe
    if (clientType === 'Groupe' && groupName) {
      clientData.groupName = groupName.trim();
    }

    const client = new Client(clientData);
    await client.save();

    // Mettre à jour le compteur de participants de l'événement
    await event.updateParticipantsCount();

    res.status(201).json({
      success: true,
      message: 'Client créé avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur POST client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du client',
      error: error.message
    });
  }
});

// GET /api/clients/:id - Récupérer un client par ID
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('assignedHotel', 'name address')
      .populate('eventId', 'name country city');

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
    const {
      firstName,
      lastName,
      phone,
      email,
      gender,
      clientType,
      groupName,
      groupSize,
      groupRelation,
      preferences,
      notes,
      status
    } = req.body;

    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Validation du type et nom de groupe
    if (clientType === 'Groupe' && !groupName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du groupe est requis pour un client de type Groupe'
      });
    }

    // Vérifier si le téléphone existe déjà dans le même événement
    if (phone && phone !== client.phone) {
      const existingClient = await Client.findOne({ 
        eventId: client.eventId,
        phone: phone.trim(),
        _id: { $ne: req.params.id } 
      });
      
      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'Un autre client avec ce numéro de téléphone existe déjà dans cet événement'
        });
      }
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (phone) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email.trim();
    if (gender) updateData.gender = gender;
    if (clientType) updateData.clientType = clientType;
    if (groupSize) updateData.groupSize = parseInt(groupSize) || 1;
    if (groupRelation) updateData.groupRelation = groupRelation;
    if (preferences) updateData.preferences = { ...client.preferences, ...preferences };
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;

    // Gérer le nom de groupe
    if (clientType === 'Groupe' && groupName) {
      updateData.groupName = groupName.trim();
    } else if (clientType === 'Standard') {
      updateData.groupName = null;
      updateData.groupSize = 1;
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('assignedHotel', 'name address')
     .populate('eventId', 'name country city');

    res.json({
      success: true,
      message: 'Client mis à jour avec succès',
      data: updatedClient
    });
  } catch (error) {
    console.error('Erreur PUT client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du client',
      error: error.message
    });
  }
});

// DELETE /api/clients/:id - Supprimer un client
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    const eventId = client.eventId;
    await Client.findByIdAndDelete(req.params.id);

    // Mettre à jour le compteur de participants de l'événement
    const event = await Event.findById(eventId);
    if (event) {
      await event.updateParticipantsCount();
    }

    // Si le client était assigné à un hôtel, mettre à jour les stats
    if (client.assignedHotel) {
      const hotel = await Hotel.findById(client.assignedHotel);
      if (hotel) {
        await hotel.updateAssignedClients();
      }
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

// DELETE /api/clients/event/:eventId - Supprimer tous les clients d'un événement
router.delete('/event/:eventId', async (req, res) => {
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

    console.log(`🗑️ Suppression de tous les clients de l'événement: ${event.name}`);
    const result = await Client.deleteMany({ eventId: eventId });
    console.log(`✅ ${result.deletedCount} clients supprimés de l'événement`);
    
    // Mettre à jour les statistiques de l'événement
    await event.updateParticipantsCount();
    
    // Mettre à jour les statistiques des hôtels de cet événement
    const hotels = await Hotel.find({ eventId: eventId });
    for (let hotel of hotels) {
      await hotel.updateAssignedClients();
    }
    
    res.json({
      success: true,
      message: `${result.deletedCount} clients supprimés avec succès de l'événement "${event.name}"`,
      deletedCount: result.deletedCount,
      event: event.name
    });
  } catch (error) {
    console.error('❌ Erreur suppression clients événement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression des clients',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🆕 POST /api/clients/import-csv - Import CSV avec sélection d'événement
router.post('/import-csv', upload.single('csvFile'), async (req, res) => {
  try {
    const { eventId } = req.body;

    // Validation des paramètres
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier CSV fourni'
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'événement est requis'
      });
    }

    // Vérifier que l'événement existe
    const event = await Event.findById(eventId);
    if (!event) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    const results = [];
    const errors = [];
    let imported = 0;
    let skipped = 0;

    console.log(`📥 Import CSV pour l'événement: ${event.name}`);

    // Lire le fichier CSV
    const stream = fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          console.log(`📊 Traitement de ${results.length} lignes CSV`);

          // Génération d'un ID de lot pour la traçabilité
          const importBatch = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // 🆕 ÉTAPE 1: VALIDATION ET PRÉPARATION DES DONNÉES
          const clientsToCreate = [];

          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const lineNum = i + 2; // +2 car ligne 1 = headers

            try {
              console.log(`🔍 Ligne ${lineNum} - Contenu brut:`, row);

              // ✅ VALIDATION DES CHAMPS OBLIGATOIRES
              const prenom = row.prenom ? row.prenom.trim() : '';
              const nom = row.nom ? row.nom.trim() : '';
              const telephone = row.telephone ? row.telephone.trim() : '';
              const sexe = row.sexe ? row.sexe.trim() : '';

              console.log(`🔍 Prenom: "${prenom}", Nom: "${nom}", Tel: "${telephone}", Sexe: "${sexe}"`);

              if (!prenom || !nom || !telephone || !sexe) {
                errors.push(`Ligne ${lineNum}: Prénom, nom, téléphone et sexe sont requis`);
                continue;
              }

              // ✅ VALIDATION DU SEXE
              const validGenders = ['Homme', 'Femme', 'Autre'];
              const gender = sexe;
              console.log(`🔍 Validation sexe: "${gender}" - Valide: ${validGenders.includes(gender)}`);
              
              if (!validGenders.includes(gender)) {
                errors.push(`Ligne ${lineNum}: Sexe invalide "${gender}". Valeurs acceptées: ${validGenders.join(', ')}`);
                continue;
              }

              // ✅ VÉRIFIER SI CLIENT DÉJÀ EXISTANT
              console.log(`🔍 Vérification client existant - Event: ${eventId}, Tel: ${telephone}`);
              const existingClient = await Client.findOne({ 
                eventId: eventId,
                phone: telephone
              });
              
              if (existingClient) {
                errors.push(`Ligne ${lineNum}: Client avec téléphone ${telephone} existe déjà dans cet événement`);
                skipped++;
                continue;
              }

              console.log(`✅ Ligne ${lineNum} - Validations passées, création du client...`);

              // ✅ VALIDATION DU TYPE
              const validTypes = ['solo', 'vip', 'influenceur', 'staff'];
              const rawType = row.type_client ? row.type_client.trim().toLowerCase() : 'solo';
              const typeMapping = {
                'solo': 'Standard',     // ✅ CORRIGÉ
                'vip': 'VIP', 
                'influenceur': 'Influenceur',
                'staff': 'Staff'
              };
              
              const clientType = typeMapping[rawType] || 'Standard';

              // ✅ DÉTERMINER LE NOM DE GROUPE
              let groupName = null;
              if (row.groupe && row.groupe.trim() && row.groupe.trim().toLowerCase() !== 'solo') {
                groupName = row.groupe.trim();
              }

              // ✅ PRÉPARER LE CLIENT
              const clientData = {
                eventId: eventId,
                firstName: prenom,
                lastName: nom,
                phone: telephone,
                email: row.email ? row.email.trim() : '',
                gender: gender,
                clientType: clientType,
                groupName: groupName,
                groupSize: 1, // Sera mis à jour après
                notes: row.notes || '',
                source: 'CSV',
                importBatch: importBatch
              };

              clientsToCreate.push(clientData);

            } catch (error) {
              console.error(`❌ Erreur ligne ${lineNum}:`, error);
              errors.push(`Ligne ${lineNum}: ${error.message}`);
            }
          }

          // 🧮 ÉTAPE 2: CALCUL DES TAILLES DE GROUPE
          const groupSizes = {};
          let staffCount = 0;

          clientsToCreate.forEach(client => {
            if (client.groupName) {
              // Groupes nommés
              groupSizes[client.groupName] = (groupSizes[client.groupName] || 0) + 1;
            } else if (client.clientType === 'Staff') {
              // Compter les staffs
              staffCount++;
            }
          });

          console.log('📊 Tailles de groupes calculées:', groupSizes);
          console.log('👥 Nombre total de staffs:', staffCount);

          // 🆕 ÉTAPE 2.5: APPLIQUER LES TAILLES AUX CLIENTS
          clientsToCreate.forEach(client => {
            if (client.groupName && groupSizes[client.groupName]) {
              // Groupe nommé
              client.groupSize = groupSizes[client.groupName];
              console.log(`📏 Client ${client.firstName} ${client.lastName} - Groupe: ${client.groupName} - Taille: ${client.groupSize}`);
            } else if (client.clientType === 'Staff') {
              // Staff = taille = nombre total de staffs
              client.groupSize = staffCount;
              console.log(`👥 Staff ${client.firstName} ${client.lastName} - Taille équipe: ${client.groupSize}`);
            } else {
              // Solo, VIP, Influenceur sans groupe
              client.groupSize = 1;
              console.log(`👤 Client ${client.firstName} ${client.lastName} - Solo - Taille: 1`);
            }
          });

          // 💾 ÉTAPE 3: CRÉATION EN BASE
          for (const clientData of clientsToCreate) {
            try {
              console.log(`🚀 Tentative création client:`, clientData);

              const client = new Client(clientData);
              await client.save();
              imported++;

              console.log(`✅ Client créé:`, client._id);
              console.log(`✅ Client créé: ${client.firstName} ${client.lastName} - ${client.clientType} - Groupe: ${client.groupName || 'Solo'}`);

            } catch (error) {
              console.warn(`💥 ERREUR CRÉATION CLIENT:`, error);
              console.warn(`💥 STACK:`, error.stack);
              errors.push(`Client ${clientData.firstName} ${clientData.lastName}: ${error.message}`);
            }
          }

          // Supprimer le fichier temporaire
          fs.unlinkSync(req.file.path);

          // Mettre à jour les statistiques de l'événement
          await event.updateParticipantsCount();

          console.log(`✅ Import terminé: ${imported} clients, ${skipped} ignorés, ${errors.length} erreurs`);

          res.json({
            success: true,
            message: `Import terminé pour "${event.name}": ${imported} clients importés, ${skipped} ignorés, ${errors.length} erreurs`,
            data: {
              event: event.name,
              imported,
              skipped,
              errorCount: errors.length,
              importBatch
            },
            errors: errors.slice(0, 20) // Limiter les erreurs affichées
          });

        } catch (error) {
          console.error('❌ Erreur traitement CSV:', error);
          fs.unlinkSync(req.file.path);
          res.status(500).json({
            success: false,
            message: 'Erreur lors du traitement du fichier CSV',
            error: error.message
          });
        }
      });

  } catch (error) {
    console.error('❌ Erreur import CSV:', error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'import CSV',
      error: error.message
    });
  }
});

// GET /api/clients/stats/:eventId - Statistiques des clients par événement
router.get('/stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    const stats = await Client.aggregate([
      { $match: { eventId: mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byType: {
            $push: {
              type: '$clientType',
              gender: '$gender',
              status: '$status',
              assigned: { $cond: [{ $ne: ['$assignedHotel', null] }, 1, 0] }
            }
          }
        }
      }
    ]);

    // Détails par type
    const typeStats = await Client.aggregate([
      { $match: { eventId: mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: '$clientType',
          count: { $sum: 1 },
          hommes: { $sum: { $cond: [{ $eq: ['$gender', 'Homme'] }, 1, 0] } },
          femmes: { $sum: { $cond: [{ $eq: ['$gender', 'Femme'] }, 1, 0] } },
          assignes: { $sum: { $cond: [{ $ne: ['$assignedHotel', null] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        event: event.name,
        general: stats[0] || { total: 0, byType: [] },
        byType: typeStats,
        lastUpdate: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur GET client stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;
