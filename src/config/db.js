const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 30,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 20_000,
      heartbeatFrequencyMS: 10_000
    });
    mongoose.connection.on('error', (err) => {
      console.error('[mongoose] connection error:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('[mongoose] disconnected');
    });
    console.log('MongoDB connected (poolSize=30)');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
