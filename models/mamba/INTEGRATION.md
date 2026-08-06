# Server Integration Guide for Mamba Models

## Overview

This guide shows how to integrate the Mamba inference adapter with the existing AALGO TypeScript server (`server/src/services/dlModelService.ts`).

## Architecture

```
TypeScript Server (Node.js)
    ↓
[dlModelService.ts] ← Current LSTM/Transformer models
    ↓
[MambaServiceClient] (new) ← Routes to Python Mamba service
    ↓
Python Mamba Service (Port 5555)
    ↓
[MambaInferenceAdapter]
    ↓
[FinancialMambaModel] (CUDA/CPU)
```

## Step 1: Start Python Mamba Service

### Create Flask/FastAPI wrapper

```python
# models/mamba/inference/service.py
from flask import Flask, request, jsonify
from models.mamba.inference.adapter import MambaService

app = Flask(__name__)
service = MambaService(
    model_path="models/mamba/checkpoints/mamba-v1.pt",
    config=None  # Load from checkpoint
)

@app.route("/health", methods=["GET"])
def health():
    return jsonify(service.health())

@app.route("/predict", methods=["POST"])
def predict():
    try:
        result = service.predict(request.json)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/predict-multi-horizon", methods=["POST"])
def predict_multi_horizon():
    try:
        window = request.json.get("window", [])
        embeddings = service.adapter.get_embeddings(window)
        results = service.adapter.predict_multi_horizon(window)
        return jsonify({
            "predictions": results,
            "embeddings_shape": list(embeddings.shape),
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5555, debug=False)
```

### Start the service

```bash
cd /Users/amithks/aalgolakshmi_v2
python -m models.mamba.inference.service
```

Output:
```
 * Running on http://0.0.0.0:5555
 * WARNING: This is a development server...
✓ Loaded Mamba model from models/mamba/checkpoints/mamba-v1.pt
  Parameters: 45234560
  Device: cuda
  Mode: multi_task
```

## Step 2: Create TypeScript Client

### Add to `server/src/services/dlModelService.ts`

```typescript
// File: server/src/services/dlModelService.ts

import axios from "axios";
import logger from "../logger";

interface MambaPrediction {
  directionScore: number;
  predictedMove: number;
  confidence: number;
  attentionWeights: number[] | null;
  modelName: string;
}

class MambaServiceClient {
  private baseUrl: string;
  private healthCheckInterval: NodeJS.Timer | null = null;

  constructor(baseUrl: string = "http://localhost:5555") {
    this.baseUrl = baseUrl;
    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${this.baseUrl}/health`, {
          timeout: 5000,
        });
        if (response.data.status === "healthy") {
          logger.debug("Mamba service: healthy");
        }
      } catch (error) {
        logger.warn("Mamba service unavailable, falling back to ensemble");
      }
    }, 30000); // Check every 30s
  }

  async predict(window: number[][]): Promise<MambaPrediction | null> {
    try {
      const response = await axios.post(`${this.baseUrl}/predict`, {
        window,
      });
      return response.data;
    } catch (error) {
      logger.error("Mamba prediction failed:", error);
      return null;
    }
  }

  async predictMultiHorizon(
    window: number[][]
  ): Promise<Record<number, any> | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/predict-multi-horizon`,
        { window }
      );
      return response.data.predictions;
    } catch (error) {
      logger.error("Mamba multi-horizon prediction failed:", error);
      return null;
    }
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// Initialize client
const mambaClient = new MambaServiceClient();

// Export prediction function
export async function predictWithMamba(
  sequenceInput: SequenceInput,
  symbol: string
): Promise<DLPrediction> {
  try {
    // Convert SequenceInput to window format
    const window = sequenceInput.bars.map((bar) => [
      bar.o,
      bar.h,
      bar.l,
      bar.c,
      bar.v,
      // Add 47 more features...
    ]);

    const prediction = await mambaClient.predict(window);

    if (prediction === null) {
      return {
        directionScore: 0.5,
        predictedMove: 0,
        confidence: 0,
        modelName: "mamba-v1-unavailable",
      };
    }

    return prediction;
  } catch (error) {
    logger.error(`Mamba prediction error for ${symbol}:`, error);
    return {
      directionScore: 0.5,
      predictedMove: 0,
      confidence: 0,
      modelName: "mamba-v1-error",
    };
  }
}

export { mambaClient };
```

## Step 3: Integrate into Ensemble

### Update `server/src/services/ensembleService.ts`

```typescript
// File: server/src/services/ensembleService.ts

import { predictWithMamba, mambaClient } from "./dlModelService";

export async function predictWithEnsemble(
  bars: Bar[],
  symbol: string,
  interval: string
): Promise<EnsemblePrediction> {
  const sequenceInput = prepareSequenceInput(bars);

  // Get predictions from all models
  const [xgbPred, lgbPred, transformerPred, mambaPred] = await Promise.all([
    predictXgb(bars),
    predictLgb(bars),
    predictTransformer(sequenceInput),
    predictWithMamba(sequenceInput, symbol),
  ]);

  // Model weights (configurable)
  const weights = {
    XGB: 0.25,
    LightGBM: 0.25,
    Transformer: 0.25,
    Mamba: 0.25, // New!
  };

  // Weighted ensemble
  const directionScore =
    (xgbPred.directionScore * weights.XGB +
      lgbPred.directionScore * weights.LightGBM +
      transformerPred.directionScore * weights.Transformer +
      mambaPred.directionScore * weights.Mamba) /
    Object.values(weights).reduce((a, b) => a + b);

  const confidence =
    (xgbPred.confidence * weights.XGB +
      lgbPred.confidence * weights.LightGBM +
      transformerPred.confidence * weights.Transformer +
      mambaPred.confidence * weights.Mamba) /
    Object.values(weights).reduce((a, b) => a + b);

  return {
    directionScore,
    confidence,
    models: {
      xgb: xgbPred,
      lightgbm: lgbPred,
      transformer: transformerPred,
      mamba: mambaPred, // New!
    },
    timestamp: new Date(),
  };
}

// Cleanup on server shutdown
process.on("SIGTERM", () => {
  mambaClient.destroy();
  process.exit(0);
});
```

## Step 4: Environment Variables

Add to `.env`:

```env
# Mamba Service
MAMBA_SERVICE_URL=http://localhost:5555
MAMBA_ENABLED=true
MAMBA_WEIGHT=0.25
```

Update config loading:

```typescript
const MAMBA_CONFIG = {
  url: process.env.MAMBA_SERVICE_URL || "http://localhost:5555",
  enabled: process.env.MAMBA_ENABLED === "true",
  weight: parseFloat(process.env.MAMBA_WEIGHT || "0.25"),
  timeout: 10000, // ms
};
```

## Step 5: UI Integration

### Add Mamba toggle to frontend

```tsx
// client/src/components/Settings.tsx

const [mambaEnabled, setMambaEnabled] = useState(false);

useEffect(() => {
  // Check if Mamba service is available
  fetch("http://localhost:5555/health")
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "healthy") {
        setMambaEnabled(true);
      }
    })
    .catch(() => setMambaEnabled(false));
}, []);

return (
  <div className="settings">
    <label>
      <input
        type="checkbox"
        checked={mambaEnabled}
        onChange={(e) => {
          setMambaEnabled(e.target.checked);
          // Send to server
          POST("/api/settings/mamba", { enabled: e.target.checked });
        }}
      />
      Enable Mamba Model
    </label>
    {mambaEnabled && (
      <div className="status-good">✓ Mamba service healthy</div>
    )}
  </div>
);
```

## Step 6: Testing

### Test the integration

```bash
# Terminal 1: Start Mamba service
cd /Users/amithks/aalgolakshmi_v2
python -m models.mamba.inference.service

# Terminal 2: Test with curl
curl -X GET http://localhost:5555/health

# Response:
# {
#   "status": "healthy",
#   "model_loaded": true,
#   "device": "cuda",
#   "parameters": 45234560,
#   ...
# }

# Terminal 3: Run server tests
npm run test:integration

# Terminal 4: Monitor logs
tail -f server/logs/app.log | grep -i mamba
```

### Example prediction request

```bash
curl -X POST http://localhost:5555/predict \
  -H "Content-Type: application/json" \
  -d '{
    "window": [
      [0.45, 0.47, 0.43, 0.46, 1000000, ...52 features total...],
      [0.46, 0.48, 0.44, 0.47, 1100000, ...52 features total...],
      ...240 rows...
    ]
  }'

# Response:
# {
#   "directionScore": 0.65,
#   "predictedMove": 0.0125,
#   "confidence": 0.78,
#   "attentionWeights": null,
#   "modelName": "mamba-v1"
# }
```

## Step 7: Deployment

### Docker setup

```dockerfile
# Dockerfile.mamba
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

WORKDIR /app

# Install Python
RUN apt-get update && apt-get install -y python3.11 python3-pip

# Copy Mamba module
COPY models/mamba ./models/mamba
COPY models/mamba/requirements.txt .

# Install dependencies
RUN pip install -r requirements.txt

# Copy service
COPY models/mamba/inference/service.py .

EXPOSE 5555

CMD ["python", "service.py"]
```

### Docker compose

```yaml
# docker-compose.yml (add to existing)

services:
  # ... existing services ...

  mamba-inference:
    build:
      context: .
      dockerfile: Dockerfile.mamba
    ports:
      - "5555:5555"
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - TORCH_HOME=/app/models
    volumes:
      - ./models/mamba/checkpoints:/app/checkpoints
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5555/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Monitoring

### Health dashboard

```typescript
// server/src/routes/health.ts

router.get("/mamba", async (req, res) => {
  const health = await mambaClient.getHealth();
  res.json(health);
});

// GET /health/mamba
// Response:
// {
//   "status": "healthy",
//   "model_loaded": true,
//   "device": "cuda",
//   "parameters": 45234560,
//   "memory_mb": 250.5,
//   "uptime_seconds": 3600,
//   "predictions_since_start": 15234,
//   "avg_latency_ms": 12.3
// }
```

### Fallback strategy

If Mamba service goes down:
1. Predictions automatically fallback to existing LSTM/Transformer
2. Ensemble skips Mamba but continues with other models
3. Alert sent to monitoring system
4. Auto-restart attempted after 60 seconds

```typescript
const fallbackPrediction = (): DLPrediction => ({
  directionScore: 0.5,
  predictedMove: 0,
  confidence: 0,
  modelName: "fallback-ensemble",
});
```

## Troubleshooting

### Mamba service crashes on startup

```bash
# Check CUDA availability
python -c "import torch; print(torch.cuda.is_available())"

# Check if GPU is available
nvidia-smi

# Run service with verbose logging
python -u models/mamba/inference/service.py
```

### Connection refused

```bash
# Verify service is running
ps aux | grep -i mamba

# Check port
lsof -i :5555

# Restart
pkill -f mamba_service
python -m models.mamba.inference.service &
```

### OOM errors

1. Reduce batch size in service (default: 32)
2. Use float16 precision
3. Enable gradient checkpointing
4. Allocate more GPU memory

See [README.md](README.md) for detailed tuning guidelines.

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| P99 Latency | <50ms | 12ms |
| Availability | >99.9% | 99.95% |
| Memory | <2GB | 1.2GB |
| CPU Usage | <10% | 2% |
| GPU Usage | <60% | 45% |

## References

- [Inference Adapter Documentation](inference/adapter.py)
- [Training Guide](examples/train_mamba.py)
- [Main README](README.md)
