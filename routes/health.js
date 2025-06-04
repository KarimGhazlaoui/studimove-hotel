const express = require('express');
const router = express.Router();

// Route de santé pour vérifier que l'API fonctionne
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Route de vérification de la base de données
router.get('/db', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    if (dbState === 1) {
      res.status(200).json({
        success: true,
        message: 'Database connected',
        state: states[dbState]
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Database not connected',
        state: states[dbState]
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database check failed',
      error: error.message
    });
  }
});

module.exports = router;