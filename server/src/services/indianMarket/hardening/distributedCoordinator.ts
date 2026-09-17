/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Distributed Coordinator & Persistent Idempotency Registry
 * ═══════════════════════════════════════════════════════════════════
 *  Enforces multi-instance safety across clustered and multi-pod deployments:
 *   - MongoDB-backed distributed lease locks with TTL
 *   - Persistent order idempotency keys (account + position + action + version)
 *   - Mutual exclusion: Instance A vs Instance B simultaneous trigger protection
 *   - Safe in-memory fallback for isolated test environments
 */

import mongoose, { Schema } from "mongoose";
import { IndianAuditLogger } from "../auditLogger.js";

// ─── 1. Mongoose Schema Definitions ─────────────────────────────────

const DistributedLockSchema = new Schema(
  {
    _id: { type: String, required: true }, // resource key
    ownerId: { type: String, required: true },
    acquiredAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
  },
  { collection: "distributed_locks", versionKey: false }
);

const IdempotencyRecordSchema = new Schema(
  {
    _id: { type: String, required: true }, // idempotencyKey
    tradeId: { type: String, required: true, index: true },
    accountId: { type: String, required: true },
    action: { type: String, required: true },
    triggerVersion: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ["IN_FLIGHT", "COMPLETED", "FAILED"], required: true },
    brokerOrderId: { type: String },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    createdAt: { type: Date, default: Date.now, expires: "7d" }, // Auto-expire after 7 days
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "idempotency_records", versionKey: false }
);

let DistributedLockModel: mongoose.Model<any>;
let IdempotencyRecordModel: mongoose.Model<any>;

try {
  DistributedLockModel = mongoose.model("DistributedLock", DistributedLockSchema);
} catch {
  DistributedLockModel = mongoose.model("DistributedLock");
}

try {
  IdempotencyRecordModel = mongoose.model("IdempotencyRecord", IdempotencyRecordSchema);
} catch {
  IdempotencyRecordModel = mongoose.model("IdempotencyRecord");
}

// ─── 2. Distributed Coordinator Class ───────────────────────────────

export class DistributedCoordinator {
  private static instanceId = `INSTANCE_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;

  // In-memory fallback registries (used when MongoDB is not connected or in unit tests)
  private static inMemoryLocks = new Map<string, { ownerId: string; expiresAt: number }>();
  private static inMemoryIdempotency = new Map<string, any>();

  public static getInstanceId(): string {
    return this.instanceId;
  }

  public static setInstanceId(id: string): void {
    this.instanceId = id;
  }

  /**
   * Generates a deterministic, persistent idempotency key
   * Format: `${accountId}:${positionId}:${action}:v${triggerVersion}`
   */
  public static generateIdempotencyKey(
    accountId: string,
    positionId: string,
    action: "TARGET_EXIT" | "STOP_EXIT" | "MANUAL_EXIT" | "SQUARE_OFF",
    triggerVersion = 1
  ): string {
    const cleanAccount = accountId || "DEFAULT_ACC";
    const cleanPos = positionId || "UNKNOWN_POS";
    return `${cleanAccount}:${cleanPos}:${action}:v${triggerVersion}`;
  }

  /**
   * Attempts to acquire a distributed lock on a resource.
   * Returns true if acquired; false if already held by another instance.
   */
  public static async acquireLock(
    resourceKey: string,
    ttlMs = 5000,
    ownerOverride?: string
  ): Promise<boolean> {
    const owner = ownerOverride || this.instanceId;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // If MongoDB is connected, use atomic database lease
    if (mongoose.connection.readyState === 1) {
      try {
        const res: any = await (DistributedLockModel.collection as any).findOneAndUpdate(
          {
            $or: [
              { _id: resourceKey, expiresAt: { $lte: now } },
              { _id: resourceKey, ownerId: owner },
            ],
          },
          {
            $set: {
              ownerId: owner,
              acquiredAt: now,
              expiresAt,
            },
          },
          { upsert: true, returnDocument: "after" }
        );

        const acquired = res?.ownerId === owner || res?.value?.ownerId === owner;
        if (acquired) return true;
      } catch (err: any) {
        // E11000 duplicate key error means lock is actively held by another instance
        if (err.code === 11000) {
          return false;
        }
      }
    }

    // Fallback: In-memory lease
    const existing = this.inMemoryLocks.get(resourceKey);
    if (existing && existing.expiresAt > now.getTime() && existing.ownerId !== owner) {
      return false; // Held by peer
    }

    this.inMemoryLocks.set(resourceKey, { ownerId: owner, expiresAt: expiresAt.getTime() });
    return true;
  }

  /**
   * Releases a distributed lock previously acquired by this instance
   */
  public static async releaseLock(
    resourceKey: string,
    ownerOverride?: string
  ): Promise<boolean> {
    const owner = ownerOverride || this.instanceId;

    if (mongoose.connection.readyState === 1) {
      try {
        const deleted = await DistributedLockModel.deleteOne({ _id: resourceKey, ownerId: owner });
        return deleted.deletedCount > 0;
      } catch {
        // Continue to in-memory cleanup
      }
    }

    const existing = this.inMemoryLocks.get(resourceKey);
    if (existing && existing.ownerId === owner) {
      this.inMemoryLocks.delete(resourceKey);
      return true;
    }
    return false;
  }

  /**
   * Registers an order intent with deterministic idempotency.
   * Returns:
   *   isNew: true if this intent is fresh and should be dispatched.
   *   isNew: false if intent was already processed or is currently in flight.
   */
  public static async registerOrderIntent(
    idempotencyKey: string,
    details: {
      tradeId: string;
      accountId: string;
      action: string;
      triggerVersion?: number;
    }
  ): Promise<{ isNew: boolean; existingRecord?: any }> {
    const now = new Date();

    if (mongoose.connection.readyState === 1) {
      try {
        const doc: any = await (IdempotencyRecordModel.collection as any).findOneAndUpdate(
          { _id: idempotencyKey },
          {
            $setOnInsert: {
              _id: idempotencyKey,
              tradeId: details.tradeId,
              accountId: details.accountId,
              action: details.action,
              triggerVersion: details.triggerVersion || 1,
              status: "IN_FLIGHT",
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true, returnDocument: "after" }
        );

        // If createdAt matches now and status is IN_FLIGHT, it was newly inserted
        const record = doc?.value || doc;
        if (record && Math.abs(new Date(record.createdAt).getTime() - now.getTime()) < 50) {
          return { isNew: true };
        }
        return { isNew: false, existingRecord: record };
      } catch (err: any) {
        if (err.code === 11000) {
          const existing = await IdempotencyRecordModel.findById(idempotencyKey).lean();
          return { isNew: false, existingRecord: existing };
        }
      }
    }

    // Fallback: In-memory registry
    if (this.inMemoryIdempotency.has(idempotencyKey)) {
      return { isNew: false, existingRecord: this.inMemoryIdempotency.get(idempotencyKey) };
    }

    const rec = {
      _id: idempotencyKey,
      ...details,
      status: "IN_FLIGHT",
      createdAt: now,
    };
    this.inMemoryIdempotency.set(idempotencyKey, rec);
    return { isNew: true };
  }

  /**
   * Marks an order intent as COMPLETED with its execution fill results
   */
  public static async completeOrderIntent(
    idempotencyKey: string,
    brokerOrderId: string,
    result: any
  ): Promise<void> {
    const now = new Date();
    if (mongoose.connection.readyState === 1) {
      try {
        await IdempotencyRecordModel.updateOne(
          { _id: idempotencyKey },
          {
            $set: {
              status: "COMPLETED",
              brokerOrderId,
              result,
              updatedAt: now,
            },
          }
        );
      } catch {}
    }

    const mem = this.inMemoryIdempotency.get(idempotencyKey);
    if (mem) {
      mem.status = "COMPLETED";
      mem.brokerOrderId = brokerOrderId;
      mem.result = result;
    }
  }

  /**
   * Marks an order intent as FAILED with an error message
   */
  public static async failOrderIntent(
    idempotencyKey: string,
    error: string
  ): Promise<void> {
    const now = new Date();
    if (mongoose.connection.readyState === 1) {
      try {
        await IdempotencyRecordModel.updateOne(
          { _id: idempotencyKey },
          {
            $set: {
              status: "FAILED",
              error,
              updatedAt: now,
            },
          }
        );
      } catch {}
    }

    const mem = this.inMemoryIdempotency.get(idempotencyKey);
    if (mem) {
      mem.status = "FAILED";
      mem.error = error;
    }
  }

  public static resetForTesting(): void {
    this.inMemoryLocks.clear();
    this.inMemoryIdempotency.clear();
  }
}
