import mongoose from 'mongoose';
import { logger } from './logger';
import { config } from './config';

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  const uri = config.mongodb.uri;

  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment variables.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
    });

    isConnected = true;

    logger.info('MongoDB connected successfully', {
      host: mongoose.connection.host,
      dbName: mongoose.connection.name,
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
    });

  } catch (err) {
    logger.error('Failed to connect to MongoDB', {
      error: (err as Error).message,
    });
    throw err;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected gracefully');
}
