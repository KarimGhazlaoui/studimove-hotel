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
    const { search, type, status } = req.query;
    let query = {};
    
    // Filtres de recherche
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const clients = await Client.find(query)
      .populate('assignedHotel', 'name location')
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
    console.log('📥 Données client reçues:', req.body);
    
    const client = new Client(req.body);
    const savedClient = await client.save();
    
    console.log('✅ Client créé:', savedClient);
    
    res.status(201).json({
      success: true,
      data: savedClient
    });
  } catch (error) {
    console.error('❌ Erreur POST client:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: messages
      });
    }
    
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
      .populate('assignedHotel', 'name location');
    
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
    console.error('Erreur GET client by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// PUT /api/clients/:id - Mettre à jour un client
router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedHotel', 'name location');
    
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
    console.error('Erreur PUT client:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour'
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
      message: 'Erreur serveur lors de la suppression'
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
    
    const clients = [];
    const errors = [];
    
    // Lire le fichier CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const client = {
            firstName: row.prenom?.trim() || row.firstName?.trim(),
            lastName: row.nom?.trim() || row.lastName?.trim(),
            phone: row.telephone?.trim() || row.phone?.trim(),
            type: row.type?.trim() || 'Solo',
            groupSize: parseInt(row.groupSize || row.taille_groupe || 1),
            notes: row.notes?.trim() || ''
          };
          
          // Validation basique
          if (!client.firstName || !client.lastName || !client.phone) {
            errors.push(`Ligne ignorée - données manquantes: ${JSON.stringify(row)}`);
            return;
          }
          
          clients.push(client);
        } catch (error) {
          errors.push(`Erreur ligne: ${JSON.stringify(row)} - ${error.message}`);
        }
      })
      .on('end', async () => {
        try {
          // Supprimer le fichier temporaire
          fs.unlinkSync(req.file.path);
          
          if (clients.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'Aucun client valide trouvé dans le CSV',
              errors
            });
          }
          
          // Sauvegarder les clients
          const savedClients = await Client.insertMany(clients, { ordered: false });
          
          res.json({
            success: true,
            message: `${savedClients.length} clients importés avec succès`,
            imported: savedClients.length,
            errors: errors.length > 0 ? errors : undefined
          });
        } catch (error) {
          console.error('Erreur sauvegarde CSV:', error);
          
          // Compter les clients déjà sauvegardés
          const insertedCount = error.insertedDocs ? error.insertedDocs.length : 0;
          
          res.status(400).json({
            success: false,
            message: 'Erreur lors de l\'importation',
            imported: insertedCount,
            errors: error.writeErrors ? error.writeErrors.map(e => e.errmsg) : [error.message]
          });
        }
      });
  } catch (error) {
    console.error('Erreur import CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'importation'
    });
  }
});

module.exports = router;