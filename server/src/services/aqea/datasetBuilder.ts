/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Dataset Builder Service (Phase 4A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaTradeAnalytics, type IAqeaTradeAnalytics } from "../../models/AqeaTradeAnalytics.js";
import fs from "node:fs/promises";
import path from "node:path";

export type ExportFormat = "CSV" | "JSONL" | "PARQUET";

export class DatasetBuilder {
  private static STORAGE_DIR = path.join((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), "data", "datasets");

  /**
   * Compiles and exports the complete AQEA dataset.
   */
  public static async export(format: ExportFormat = "JSONL"): Promise<string> {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
      const records = await AqeaTradeAnalytics.find().sort({ timestamp: 1 }).lean();
      
      const filename = `aqea_dataset_${Date.now()}.${format.toLowerCase()}`;
      const fullPath = path.join(this.STORAGE_DIR, filename);

      let content = "";
      if (format === "JSONL") {
        content = records.map(r => JSON.stringify(this.flattenRecord(r))).join("\n");
      } else if (format === "CSV") {
        content = this.convertToCSV(records.map(r => this.flattenRecord(r)));
      } else if (format === "PARQUET") {
        // Mock Parquet export - in production use 'parquetjs-lite'
        content = JSON.stringify(records.map(r => this.flattenRecord(r)));
        console.warn("[DatasetBuilder] Parquet format is currently exported as JSON for compatibility stubs.");
      }

      await fs.writeFile(fullPath, content);
      return fullPath;
    } catch (err) {
      console.error("[AQEA_DATASET_BUILDER_ERROR]", err);
      throw err;
    }
  }

  /**
   * Flattens the nested Mongoose document for machine learning use.
   */
  private static flattenRecord(r: any): any {
    const timestamp = r.timestamp instanceof Date ? r.timestamp.toISOString() : (r.timestamp || "");
    return {
      timestamp,
      symbol: r.symbol,
      decision: r.decision,
      
      // Market
      ...r.marketFeatures,
      
      // Regime
      regimeState: r.regimeState,
      regimeScore: r.regimeScore,
      
      // Microstructure
      ...r.orderFlowFeatures,
      ...r.smartMoneyFeatures,
      
      // Execution
      ...r.executionFeatures,
      
      // Outcomes
      ...r.outcomeFeatures,
      
      // Labels
      ...r.labels
    };
  }

  private static convertToCSV(data: any[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => 
      headers.map(header => JSON.stringify(obj[header] ?? "")).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }
}
