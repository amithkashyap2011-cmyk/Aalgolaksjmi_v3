/*
 * ─── Instant Rollback Manager ────────────────────────────────
 *
 * Supports instant 1-click rollback to previous Champion version snapshot
 * stored in DeploymentHistory / ModelVersion registry.
 */

import { ModelVersion } from "../../models/ModelVersion.js";
import { DeploymentHistory } from "../../models/DeploymentHistory.js";
import { RollbackHistory } from "../../models/RollbackHistory.js";

export class RollbackManager {
  /**
   * Executes instant rollback to previous version snapshot.
   */
  public static async executeRollback(modelName: string): Promise<any> {
    const lastDeploy = await DeploymentHistory.findOne({ modelName }).sort({ promotedAt: -1 });
    if (!lastDeploy) {
      throw new Error(`No deployment history found for model ${modelName}`);
    }

    const currentChamp = await ModelVersion.findOne({ modelName, role: "CHAMPION" });
    const targetPrev = await ModelVersion.findOne({ modelName, version: lastDeploy.previousVersion });

    if (!targetPrev) {
      throw new Error(`Previous version snapshot ${lastDeploy.previousVersion} not found`);
    }

    // Demote current Champion to ARCHIVED
    if (currentChamp) {
      await ModelVersion.updateOne({ _id: currentChamp._id }, { $set: { role: "ARCHIVED" } });
    }

    // Restore previous Champion to CHAMPION
    await ModelVersion.updateOne({ _id: targetPrev._id }, { $set: { role: "CHAMPION" } });

    // Log Rollback
    await RollbackHistory.create({
      modelName,
      rolledBackFromVersion: currentChamp?.version || "UNKNOWN",
      restoredToVersion: targetPrev.version,
      reason: "INSTANT_MANUAL_OR_AUTOMATED_ROLLBACK",
      rolledBackAt: new Date(),
    });

    return {
      success: true,
      restoredVersion: targetPrev.version,
      previousVersion: currentChamp?.version,
    };
  }
}
