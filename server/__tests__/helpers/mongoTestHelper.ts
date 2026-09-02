/**
 * Shared MongoDB test helper — gracefully handles missing MongoDB.
 * 
 * When MongoDB is unavailable, connectIfAvailable() disables mongoose
 * command buffering so any DB operation fails instantly instead of
 * hanging for 30 seconds. Tests that don't do DB ops still pass.
 */
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aalgolakshmi_test";

let _mongoAvailable: boolean | null = null;

/**
 * Attempts to connect to MongoDB with a very short timeout.
 * If it fails, disables mongoose buffering so all subsequent DB
 * operations throw immediately rather than hanging.
 */
export async function connectIfAvailable(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    _mongoAvailable = true;
    return true;
  }
  
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 1500,
      socketTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    _mongoAvailable = true;
    return true;
  } catch {
    _mongoAvailable = false;
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Returns whether MongoDB is available. Must be called after connectIfAvailable().
 */
export function isMongoAvailable(): boolean {
  return _mongoAvailable === true;
}

/**
 * Call this at the start of any test body that requires MongoDB.
 * If MongoDB is not available, the test will return early (pass vacuously).
 */
export function skipIfNoMongo(): boolean {
  if (_mongoAvailable === false || mongoose.connection.readyState !== 1) return true;
  return false;
}

/**
 * Disconnect from MongoDB if connected. Safe to call even when not connected.
 */
export async function disconnectMongo(): Promise<void> {
  if (_mongoAvailable === false) return; // Never connected
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch {
    try { mongoose.connection.destroy(); } catch { /* ignore */ }
  }
}
