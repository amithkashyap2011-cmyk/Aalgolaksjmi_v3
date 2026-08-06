import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(currentDir, "../../../../../shared/schemas/feature_schema.json");
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
