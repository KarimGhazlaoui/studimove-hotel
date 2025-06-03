const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Suppression de l'avertissement strictQuery
    mongoose.set('strictQuery', false);
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`MongoDB connecté: ${conn.connection.host}`.cyan.underline.bold);
    return conn;
  } catch (error) {
    console.error(`Erreur: ${error.message}`.red);
    process.exit(1);
  }
};

module.exports = connectDB;
