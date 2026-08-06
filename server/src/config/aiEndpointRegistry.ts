import { getQuantEngineURL } from './serviceDiscovery.js';

export const AI_ENDPOINTS = {
  CNN: "/predict/cnn",
  LSTM: "/predict/lstm",
  PPO: "/predict/ppo-execution",
  MAMBA: "/research/predict/mamba",
  TRANSFORMER: "/research/predict/transformer-micro",
  HEALTH: "/health",
  MODEL_HEALTH: "/health/models",
  GOVERNANCE: "/health/governance",
  ANALYZE_SPREAD: "/api/v1/analyze-spread",
  REGIME_FORECAST: "/research/regime/forecast",
  SPECTRAL_REGIME: "/api/v1/spectral-regime"
};

export async function buildEndpointUrl(endpointPath: string): Promise<string> {
  const baseUrl = await getQuantEngineURL();
  return `${baseUrl}${endpointPath}`;
}
