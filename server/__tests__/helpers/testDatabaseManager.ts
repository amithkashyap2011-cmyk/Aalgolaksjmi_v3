/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Test Database Manager (Isolated In-Memory MongoDB)
 * ═══════════════════════════════════════════════════════════════════
 *  Authoritative in-memory MongoDB manager for hermetic, deterministic
 *  test execution without reliance on external running MongoDB services.
 *
 *  Guarantees:
 *  - Deterministic in-memory database per test worker
 *  - Fast startup using local system mongod binary if present
 *  - bufferCommands: false to eliminate 10s query hangs
 *  - Clean lifecycle teardown (zero dangling connections or open handles)
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import fs from "fs";

export class TestDatabaseManager {
  private static instance: MongoMemoryServer | null = null;
  private static uri: string | null = null;

  /**
   * Resolves system mongod binary if available for fastest startup.
   */
  private static getSystemBinary(): string | undefined {
    if (process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(process.env.MONGOMS_SYSTEM_BINARY)) {
      return process.env.MONGOMS_SYSTEM_BINARY;
    }
    const candidates = [
      "/opt/homebrew/bin/mongod",
      "/usr/local/bin/mongod",
      "/usr/bin/mongod",
    ];
    for (const path of candidates) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
    return undefined;
  }

  /**
   * Starts the in-memory MongoDB server if not already started.
   */
  public static async start(): Promise<string> {
    if (this.instance && this.uri) {
      return this.uri;
    }

    const systemBinary = this.getSystemBinary();
    const opts: any = {};
    if (systemBinary) {
      opts.binary = { systemBinary };
    }

    this.instance = await MongoMemoryServer.create(opts);
    this.uri = this.instance.getUri();
    process.env.MONGO_URI = this.uri;
    process.env.MONGODB_URI = this.uri;
    return this.uri;
  }

  /**
   * Connects Mongoose to the isolated in-memory test database.
   */
  public static async connect(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    const uri = await this.start();

    // Disable global buffering so operations fail fast if disconnected rather than hanging
    mongoose.set("bufferCommands", false);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      bufferCommands: false,
    });

    return mongoose;
  }

  /**
   * Safely clears all collections in the test database.
   */
  public static async clear(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      try {
        await collections[key].deleteMany({});
      } catch {
        // Ignored in teardown
      }
    }
  }

  /**
   * Disconnects Mongoose from the test database.
   */
  public static async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        try {
          (mongoose.connection as any)?.destroy?.();
        } catch {}
      }
    }
  }

  /**
   * Fully stops the in-memory MongoDB server and closes all connections.
   */
  public static async stop(): Promise<void> {
    await this.disconnect();

    if (this.instance) {
      try {
        await this.instance.stop();
      } catch {
        // Ignored
      }
      this.instance = null;
      this.uri = null;
    }
  }

  /**
   * Returns whether the database is connected.
   */
  public static isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Returns the current URI if started.
   */
  public static getUri(): string | null {
    return this.uri;
  }
}

export const TestDbManager = TestDatabaseManager;
