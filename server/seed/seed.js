const mongoose = require('mongoose');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connecté pour le seeding...');
  } catch (error) {
    console.error('Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    await connectDB();
    
    // Supprimer les données existantes
    await Hotel.deleteMany();
    await Room.deleteMany();
    
    // Créer des hôtels
    const hotel1 = await Hotel.create({
      name: 'Grand Hôtel Paris',
      address: {
        street: '1 Rue de Rivoli',
        city: 'Paris',
        postalCode: '75001',
        country: 'France'
      },
      description: 'Hôtel de luxe au cœur de Paris',
      contactInfo: {
        phone: '+33 1 23 45 67 89',
        email: 'contact@grandhotel.fr'
      }
    });
    
    const hotel2 = await Hotel.create({
      name: 'Résidence Marseille',
      address: {
        street: '23 Avenue du Prado',
        city: 'Marseille',
        postalCode: '13008',
        country: 'France'
      },
      description: 'Vue imprenable sur la Méditerranée',
      contactInfo: {
        phone: '+33 4 91 23 45 67',
        email: 'info@residencemarseille.fr'
      }
    });
    
    // Créer des chambres
    await Room.create([
      {
        hotel: hotel1._id,
        roomNumber: '101',
        capacity: 2,
        gender: 'mixed',
        isPrivate: false,
        price: 120,
        amenities: ['WiFi', 'TV', 'Climatisation']
      },
      {
        hotel: hotel1._id,
        roomNumber: '102',
        capacity: 4,
        gender: 'mixed',
        isPrivate: false,
        price: 180,
        amenities: ['WiFi', 'TV', 'Climatisation', 'Mini-bar']
      },
      {
        hotel: hotel2._id,
        roomNumber: 'A1',
        capacity: 2,
        gender: 'mixed',
        isPrivate: true,
        privatizationCost: 50,
        price: 90,
        amenities: ['WiFi', 'TV']
      }
    ]);
    
    console.log('Données importées avec succès!');
    process.exit();
  } catch (error) {
    console.error(`Erreur: ${error.message}`);
    process.exit(1);
  }
};

importData();