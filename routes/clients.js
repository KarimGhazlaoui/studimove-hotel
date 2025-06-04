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
          assignedHotel: { $first: '$assignedHotel' },
          genders: { $push: '$gender' },
          groupRelation: { $first: '$groupRelation' }
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
          hommes: { $sum: { $cond: [{ $eq: ['$gender', 'Homme'] }, 1, 0] } },
          femmes: { $sum: { $cond: [{ $eq: ['$gender', 'Femme'] }, 1, 0] } },
          autres: { $sum: { $cond: [{ $eq: ['$gender', 'Autre'] }, 1, 0] } },
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
      hommes: 0,
      femmes: 0,
      autres: 0,
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
              // Validation des champs requis
              if (!row.prenom || !row.nom || !row.telephone || !row.sexe) {
                errors.push(`Ligne ${lineNum}: Prénom, nom, téléphone et sexe requis`);
                continue;
              }

              // 🆕 Validation du sexe
              const gender = row.sexe.toLowerCase().trim();
              let clientGender = 'Autre';
              
              if (['homme', 'h', 'm', 'male'].includes(gender)) {
                clientGender = 'Homme';
              } else if (['femme', 'f', 'female'].includes(gender)) {
                clientGender = 'Femme';
              }

              // Déterminer le type et nom de groupe
              let clientType = 'Solo';
              let clientGroupName = null;
              let groupRelation = null;
              
              if (row.groupe && typeof row.groupe === 'string' && row.groupe.trim() !== '') {
                const groupValue = row.groupe.trim();
                if (groupValue.toLowerCase() === 'solo') {
                  clientType = 'Solo';
                  clientGroupName = null;
                } else {
                  clientType = 'Groupe';
                  clientGroupName = groupValue;
                  
                  // 🆕 Déterminer le type de relation
                  const groupLower = groupValue.toLowerCase();
                  if (groupLower.includes('famille') || groupLower.includes('family')) {
                    groupRelation = 'Famille';
                  } else if (groupLower.includes('couple')) {
                    groupRelation = 'Couple';
                  } else if (groupLower.includes('ami') || groupLower.includes('friend')) {
                    groupRelation = 'Amis';
                  } else if (groupLower.includes('staff') || groupLower.includes('travail') || groupLower.includes('work')) {
                    groupRelation = 'Collègues';
                  } else {
                    groupRelation = 'Autre';
                  }
                }
              }

              // Vérifier si client existe déjà
              const existingClient = await Client.findOne({ phone: row.telephone.trim() });
              if (existingClient) {
                errors.push(`Ligne ${lineNum}: Client ${row.telephone} existe déjà`);
                continue;
              }

              let groupSize = parseInt(row.taille_groupe) || 1;
              if (clientType === 'Solo') {
                groupSize = 1;
              }

              // 🆕 Créer le client avec sexe et relation
              const clientData = {
                firstName: row.prenom.trim(),
                lastName: row.nom.trim(),
                phone: row.telephone.trim(),
                gender: clientGender,
                type: clientType,
                groupName: clientGroupName,
                groupRelation: groupRelation,
                groupSize: groupSize,
                notes: row.notes ? row.notes.trim() : '',
                status: 'En attente'
              };

              console.log(`💾 Création client:`, clientData);

              const client = new Client(clientData);
              await client.save();
              imported++;

              console.log(`✅ Client créé: ${client.firstName} ${client.lastName} - ${client.gender} - Type: ${client.type}, Groupe: ${client.groupName}`);

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

// 🆕 POST /api/clients/assign-rooms - Assignation intelligente des chambres
router.post('/assign-rooms', async (req, res) => {
  try {
    const { hotelId, roomConfigurations } = req.body;
    
    // roomConfigurations = [
    //   { roomNumber: "101", capacity: 2, bedType: "Double" },
    //   { roomNumber: "102", capacity: 4, bedType: "Twin" },
    //   etc...
    // ]

    if (!hotelId || !roomConfigurations || !Array.isArray(roomConfigurations)) {
      return res.status(400).json({
        success: false,
        message: 'ID hôtel et configuration des chambres requis'
      });
    }

    // Récupérer tous les clients en attente pour cet hôtel
    const clients = await Client.find({ 
      status: 'En attente',
      $or: [
        { assignedHotel: hotelId },
        { assignedHotel: null }
      ]
    });

    console.log(`🏨 Assignation pour hôtel ${hotelId}: ${clients.length} clients à traiter`);

    // 🎯 Algorithme d'assignation intelligente
    const roomAssignments = await assignRoomsIntelligently(clients, roomConfigurations);

    // Sauvegarder les assignations
    const assignments = [];
    for (const assignment of roomAssignments.success) {
      for (const clientId of assignment.clientIds) {
        await Client.findByIdAndUpdate(clientId, {
          assignedHotel: hotelId,
          assignedRoom: {
            roomNumber: assignment.roomNumber,
            roomType: assignment.roomType,
            bedType: assignment.bedType,
            capacity: assignment.capacity
          },
          status: 'Assigné'
        });
      }
      assignments.push(assignment);
    }

    res.json({
      success: true,
      message: `Assignation terminée: ${assignments.length} chambres assignées`,
      totalClientsProcessed: clients.length,
      assignments: assignments,
      unassigned: roomAssignments.unassigned,
      errors: roomAssignments.errors
    });

  } catch (error) {
    console.error('Erreur assignation chambres:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation des chambres',
      error: error.message
    });
  }
});

// 🆕 GET /api/clients/room-assignments/:hotelId - Voir les assignations actuelles
router.get('/room-assignments/:hotelId', async (req, res) => {
  try {
    const clients = await Client.find({ 
      assignedHotel: req.params.hotelId,
      status: 'Assigné'
    }).populate('assignedHotel', 'name');

    // Grouper par chambre
    const roomAssignments = {};
    
    clients.forEach(client => {
      const roomNumber = client.assignedRoom?.roomNumber || 'Non assigné';
      
      if (!roomAssignments[roomNumber]) {
        roomAssignments[roomNumber] = {
          roomNumber: roomNumber,
          roomType: client.assignedRoom?.roomType || 'Inconnue',
          bedType: client.assignedRoom?.bedType || 'Inconnue',
          capacity: client.assignedRoom?.capacity || 0,
          clients: []
        };
      }
      
      roomAssignments[roomNumber].clients.push({
        id: client._id,
        name: `${client.firstName} ${client.lastName}`,
        gender: client.gender,
        type: client.type,
        groupName: client.groupName,
        groupRelation: client.groupRelation,
        phone: client.phone,
        notes: client.notes
      });
    });

    res.json({
      success: true,
      hotelId: req.params.hotelId,
      totalClients: clients.length,
      totalRooms: Object.keys(roomAssignments).length,
      assignments: Object.values(roomAssignments)
    });

  } catch (error) {
    console.error('Erreur récupération assignations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des assignations'
    });
  }
});

// 🆕 PUT /api/clients/move-client - Déplacer un client vers une autre chambre
router.put('/move-client', async (req, res) => {
  try {
    const { clientId, newRoomNumber, newRoomType, newBedType, newCapacity } = req.body;

    if (!clientId || !newRoomNumber) {
      return res.status(400).json({
        success: false,
        message: 'ID client et numéro de chambre requis'
      });
    }

    const client = await Client.findByIdAndUpdate(
      clientId,
      {
        assignedRoom: {
          roomNumber: newRoomNumber,
          roomType: newRoomType || 'Standard',
          bedType: newBedType || 'Twin',
          capacity: newCapacity || 2
        }
      },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Client déplacé avec succès',
      data: client
    });

  } catch (error) {
    console.error('Erreur déplacement client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du déplacement du client'
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
    const { search, type, status, groupName, gender } = req.query;
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
    if (gender && gender !== 'all') filter.gender = gender;

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
    const { firstName, lastName, phone, gender, type, groupName, groupRelation, groupSize, notes } = req.body;

    if (!firstName || !lastName || !phone || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Prénom, nom, téléphone et sexe sont requis'
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
      gender: gender,
      type: type || 'Solo',
      groupSize: parseInt(groupSize) || 1,
      notes: notes || ''
    };

    if (type === 'Groupe' && groupName) {
      clientData.groupName = groupName.trim();
      clientData.groupRelation = groupRelation || 'Autre';
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
    const { firstName, lastName, phone, gender, type, groupName, groupRelation, groupSize, notes } = req.body;

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
      gender: gender,
      type: type || 'Solo',
      groupSize: parseInt(groupSize) || 1,
      notes: notes || ''
    };

    if (type === 'Groupe' && groupName) {
      updateData.groupName = groupName.trim();
      updateData.groupRelation = groupRelation || 'Autre';
    } else {
      updateData.groupName = null;
      updateData.groupRelation = null;
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

// 🧠 FONCTIONS UTILITAIRES

// Fonction d'assignation intelligente des chambres
async function assignRoomsIntelligently(clients, rooms) {
  const assignments = [];
  const unassigned = [];
  const errors = [];
  const availableRooms = [...rooms]; // Copie des chambres disponibles

  console.log(`🏨 Début assignation: ${clients.length} clients, ${rooms.length} chambres`);

  // 1. Grouper les clients par groupe
  const groups = {};
  const soloClients = [];

  clients.forEach(client => {
    if (client.type === 'Solo') {
      soloClients.push(client);
    } else {
      if (!groups[client.groupName]) {
        groups[client.groupName] = [];
      }
      groups[client.groupName].push(client);
    }
  });

  console.log(`👥 Groupes trouvés: ${Object.keys(groups).length}, Clients solo: ${soloClients.length}`);

  // 2. Assigner d'abord les groupes
  for (const [groupName, groupMembers] of Object.entries(groups)) {
    const groupSize = groupMembers.length;
    const groupRelation = groupMembers[0].groupRelation;
    const canShareMixed = ['Famille', 'Couple'].includes(groupRelation);

    console.log(`🔍 Traitement groupe "${groupName}": ${groupSize} membres, relation: ${groupRelation}, mixité: ${canShareMixed}`);

    // Trouver une chambre assez grande
    let suitableRoom = availableRooms.find(room => room.capacity >= groupSize);
    
    if (suitableRoom) {
      // Groupe peut tenir dans une chambre
      assignments.push({
        roomNumber: suitableRoom.roomNumber,
        roomType: `Groupe - ${groupName}`,
        bedType: suitableRoom.bedType,
        capacity: suitableRoom.capacity,
        clientIds: groupMembers.map(c => c._id),
        clients: groupMembers.map(c => ({
          name: `${c.firstName} ${c.lastName}`,
          gender: c.gender,
          groupRelation: c.groupRelation
        }))
      });
      
      // Retirer la chambre des disponibles
      availableRooms.splice(availableRooms.indexOf(suitableRoom), 1);
      
      console.log(`✅ Groupe "${groupName}" assigné en chambre ${suitableRoom.roomNumber}`);
      
    } else {
      // 🔥 Diviser le groupe en sous-groupes par sexe si nécessaire
      console.log(`⚠️ Groupe "${groupName}" trop grand, division nécessaire`);
      
      if (!canShareMixed) {
        const menGroup = groupMembers.filter(c => c.gender === 'Homme');
        const womenGroup = groupMembers.filter(c => c.gender === 'Femme');
        const otherGroup = groupMembers.filter(c => c.gender === 'Autre');

        console.log(`👨 Hommes: ${menGroup.length}, 👩 Femmes: ${womenGroup.length}, 👤 Autres: ${otherGroup.length}`);

        // Assigner les hommes
        if (menGroup.length > 0) {
          const menRoom = availableRooms.find(room => room.capacity >= menGroup.length);
          if (menRoom) {
            assignments.push({
              roomNumber: menRoom.roomNumber,
              roomType: `Groupe - ${groupName} (Hommes)`,
              bedType: menRoom.bedType,
              capacity: menRoom.capacity,
              clientIds: menGroup.map(c => c._id),
              clients: menGroup.map(c => ({ name: `${c.firstName} ${c.lastName}`, gender: c.gender }))
            });
            availableRooms.splice(availableRooms.indexOf(menRoom), 1);
            console.log(`✅ Hommes du groupe "${groupName}" assignés en chambre ${menRoom.roomNumber}`);
          } else {
            unassigned.push(...menGroup);
            console.log(`❌ Hommes du groupe "${groupName}" non assignés (pas de chambre)`);
          }
        }

        // Assigner les femmes
        if (womenGroup.length > 0) {
          const womenRoom = availableRooms.find(room => room.capacity >= womenGroup.length);
          if (womenRoom) {
            assignments.push({
              roomNumber: womenRoom.roomNumber,
              roomType: `Groupe - ${groupName} (Femmes)`,
              bedType: womenRoom.bedType,
              capacity: womenRoom.capacity,
              clientIds: womenGroup.map(c => c._id),
              clients: womenGroup.map(c => ({ name: `${c.firstName} ${c.lastName}`, gender: c.gender }))
            });
            availableRooms.splice(availableRooms.indexOf(womenRoom), 1);
            console.log(`✅ Femmes du groupe "${groupName}" assignées en chambre ${womenRoom.roomNumber}`);
          } else {
            unassigned.push(...womenGroup);
            console.log(`❌ Femmes du groupe "${groupName}" non assignées (pas de chambre)`);
          }
        }

        // Assigner les autres
        if (otherGroup.length > 0) {
          const otherRoom = availableRooms.find(room => room.capacity >= otherGroup.length);
          if (otherRoom) {
            assignments.push({
              roomNumber: otherRoom.roomNumber,
              roomType: `Groupe - ${groupName} (Autres)`,
              bedType: otherRoom.bedType,
              capacity: otherRoom.capacity,
              clientIds: otherGroup.map(c => c._id),
              clients: otherGroup.map(c => ({ name: `${c.firstName} ${c.lastName}`, gender: c.gender }))
            });
            availableRooms.splice(availableRooms.indexOf(otherRoom), 1);
            console.log(`✅ Autres du groupe "${groupName}" assignés en chambre ${otherRoom.roomNumber}`);
          } else {
            unassigned.push(...otherGroup);
            console.log(`❌ Autres du groupe "${groupName}" non assignés (pas de chambre)`);
          }
        }

      } else {
        // Groupe peut être mixte, mais trop grand pour une chambre
        // Diviser par taille de chambre disponible
        let remainingMembers = [...groupMembers];
        let subGroupIndex = 1;
        
        while (remainingMembers.length > 0 && availableRooms.length > 0) {
          const largestRoom = availableRooms.reduce((max, room) => 
            room.capacity > max.capacity ? room : max
          );
          
          const membersForThisRoom = remainingMembers.splice(0, largestRoom.capacity);
          
          assignments.push({
            roomNumber: largestRoom.roomNumber,
            roomType: `Groupe - ${groupName} (${subGroupIndex}/${Math.ceil(groupSize / largestRoom.capacity)})`,
            bedType: largestRoom.bedType,
            capacity: largestRoom.capacity,
            clientIds: membersForThisRoom.map(c => c._id),
            clients: membersForThisRoom.map(c => ({ name: `${c.firstName} ${c.lastName}`, gender: c.gender }))
          });
          
          availableRooms.splice(availableRooms.indexOf(largestRoom), 1);
          console.log(`✅ Sous-groupe ${subGroupIndex} de "${groupName}" assigné en chambre ${largestRoom.roomNumber}`);
          subGroupIndex++;
        }
        
        // Membres restants non assignés
        if (remainingMembers.length > 0) {
          unassigned.push(...remainingMembers);
          console.log(`❌ ${remainingMembers.length} membres du groupe "${groupName}" non assignés`);
        }
      }
    }
  }

  // 3. Assigner les clients solo par sexe
  console.log(`🏃 Assignation des clients solo...`);
  
  const soloMen = soloClients.filter(c => c.gender === 'Homme');
  const soloWomen = soloClients.filter(c => c.gender === 'Femme');
  const soloOthers = soloClients.filter(c => c.gender === 'Autre');

  console.log(`👨 Solo Hommes: ${soloMen.length}, 👩 Solo Femmes: ${soloWomen.length}, 👤 Solo Autres: ${soloOthers.length}`);

  // Assigner les hommes solo
  assignSoloByGender(soloMen, 'Homme', availableRooms, assignments, unassigned);
  
  // Assigner les femmes solo
  assignSoloByGender(soloWomen, 'Femme', availableRooms, assignments, unassigned);
  
  // Assigner les autres solo
  assignSoloByGender(soloOthers, 'Autre', availableRooms, assignments, unassigned);

  console.log(`🏁 Assignation terminée: ${assignments.length} chambres assignées, ${unassigned.length} clients non assignés`);

  return {
    success: assignments,
    unassigned: unassigned.map(c => ({
      id: c._id,
      name: `${c.firstName} ${c.lastName}`,
      gender: c.gender,
      type: c.type,
      groupName: c.groupName
    })),
    errors: errors
  };
}

// 🎯 Fonction pour assigner les clients solo par sexe
function assignSoloByGender(clients, gender, availableRooms, assignments, unassigned) {
  console.log(`🔍 Assignation Solo ${gender}: ${clients.length} clients`);

  for (const client of clients) {
    let assigned = false;

    // 1. Chercher une chambre existante avec des clients du même sexe et de la place
    let existingRoom = assignments.find(assignment => 
      assignment.roomType === `Solo - ${gender}` && 
      assignment.clients.length < assignment.capacity
    );

    if (existingRoom) {
      // Ajouter à la chambre existante
      existingRoom.clientIds.push(client._id);
      existingRoom.clients.push({ 
        name: `${client.firstName} ${client.lastName}`, 
        gender: client.gender 
      });
      assigned = true;
      console.log(`✅ ${client.firstName} ${client.lastName} ajouté à la chambre ${existingRoom.roomNumber}`);
      
    } else {
      // 2. Créer une nouvelle chambre
      const suitableRoom = availableRooms.find(room => room.capacity >= 1);
      
      if (suitableRoom) {
        assignments.push({
          roomNumber: suitableRoom.roomNumber,
          roomType: `Solo - ${gender}`,
          bedType: suitableRoom.bedType,
          capacity: suitableRoom.capacity,
          clientIds: [client._id],
          clients: [{ 
            name: `${client.firstName} ${client.lastName}`, 
            gender: client.gender 
          }]
        });
        
        availableRooms.splice(availableRooms.indexOf(suitableRoom), 1);
        assigned = true;
        console.log(`✅ ${client.firstName} ${client.lastName} assigné à nouvelle chambre ${suitableRoom.roomNumber}`);
        
      }
    }

    if (!assigned) {
      unassigned.push(client);
      console.log(`❌ ${client.firstName} ${client.lastName} non assigné (pas de place)`);
    }
  }
}

module.exports = router;
