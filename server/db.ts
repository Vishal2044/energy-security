import mongoose from 'mongoose';
import { env } from './config/env.js';

export async function connectDatabase(): Promise<boolean> {
  if (!env.mongoUri) return false;
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: env.nodeEnv === 'production' ? 30000 : 2500 });
    return true;
  }
  catch (error) {
    if (env.nodeEnv === 'production') throw new Error('DATABASE_UNAVAILABLE');
    console.warn('MongoDB unavailable; using development memory adapter.');
    return false;
  }
}

export function isDatabaseConnected() { return mongoose.connection.readyState === 1; }
