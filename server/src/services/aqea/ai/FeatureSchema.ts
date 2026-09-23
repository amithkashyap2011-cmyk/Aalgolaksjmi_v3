import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function resolveSchemaPath(): string {
  const metaDir = typeof import.meta?.url === "string" ? path.dirname(fileURLToPath(import.meta.url)) : "";
  const candidates = [
    metaDir ? path.resolve(metaDir, "../../../../../shared/schemas/feature_schema.json") : "",
    metaDir ? path.resolve(metaDir, "../../../../shared/schemas/feature_schema.json") : "",
    path.resolve(process.cwd(), "shared/schemas/feature_schema.json"),
    path.resolve(process.cwd(), "../shared/schemas/feature_schema.json"),
    "/Users/amithks/aalgolakshmi_v3/shared/schemas/feature_schema.json"
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0] || "shared/schemas/feature_schema.json";
}

const SCHEMA_PATH = resolveSchemaPath();
const schemaData = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));

export interface FeatureDefinition {
  name: string;
  mean: number;
  std: number;
  index: number;
}

export const FEATURE_SCHEMA_V8: FeatureDefinition[] = schemaData.FEATURE_NAMES.map((name: string, index: number) => ({
  index,
  name,
  mean: schemaData.MEANS[index],
  std: schemaData.STDS[index]
}));

export const CNN_INPUT_DIMENSION = schemaData.DIMENSION;
