# DYNAMIC PORT AUDIT

| FILE | LINE | CURRENT VALUE | RECOMMENDED FIX |
| :--- | :--- | :--- | :--- |
| `MAMBA_ROOT_CAUSE_ANALYSIS.md` | 9, 42 | `localhost:8080`, `localhost:5555`, `MAMBA_SERVICE_URL` | Audit doc only |
| `ENSEMBLE_IMPLEMENTATION.md` | 247 | `http://localhost:9991` | Audit doc only |
| `cpp-hft-engine/src/main.cpp` | 84 | `tcp://127.0.0.1:5555` | Out of scope (C++) |
| `ENVIRONMENT_VALIDATION_REPORT.md` | 10 | `http://localhost:8000` | Audit doc only |
| `rust-services/src/gateway/mod.rs` | 21 | `tcp://127.0.0.1:5555` | Out of scope (Rust) |
| `rust-services/src/main.rs` | 25 | `tcp://127.0.0.1:5555` | Out of scope (Rust) |
| `models/mamba/INTEGRATION.md` | 106, 278, 287... | `http://localhost:5555`, `MAMBA_SERVICE_URL` | Audit doc only |
| `server/src/services/quantum/knowledgeSystem.ts` | 16 | `http://localhost:8000` | Replace with dynamic discovery |
| `client/src/lib/socket.ts` | 20 | `http://127.0.0.1:9991` | Replace with dynamic discovery or relative path |
| `client/src/hooks/useSocket.ts` | 5 | `http://localhost:9991`, `VITE_API_URL` | Replace with dynamic discovery or relative path |
| `client/src/components/ai/AIHealthPanel.tsx` | 28 | `http://127.0.0.1:8000/health/models` | Replace with dynamic discovery |
| `server/src/services/TransformerPredictor.ts` | 15 | `http://localhost:8000/research/predict/transformer-micro` | Use `aiEndpointRegistry.ts` |
| `server/src/services/hybridEngine.ts` | 59 | `http://127.0.0.1:8080/api/v1/analyze-spread` | Use dynamic discovery |
| `server/src/services/MambaPredictor.ts` | 15, 54 | `http://localhost:8000`, `MAMBA_SERVICE_URL` | Use `aiEndpointRegistry.ts` |
| `client/test_sio.js` | 3 | `http://127.0.0.1:9991` | Test file |
| `client/vite.config.ts` | 18-28 | `http://127.0.0.1:9991` | Keep proxy or update to dynamic port if required |
| `client/test-socket-client.ts` | 3 | `http://localhost:9991` | Test file |
| `server/src/services/aqea/research/RegimeForecastPredictor.ts` | 18 | `http://127.0.0.1:8080`, `PYTHON_QUANT_ENGINE_URL` | Use `aiEndpointRegistry.ts` |
| `server/src/services/modelRegistry.ts` | 159 | `http://localhost:5555`, `MAMBA_SERVICE_URL` | Use `aiEndpointRegistry.ts` |
| `server/src/services/spectralRegimeService.ts` | 112 | `http://127.0.0.1:8080/api/v1/spectral-regime` | Use dynamic discovery |
| `server/docs/ML_integration.md` | 185, 369 | `http://localhost:8000` | Audit doc only |
| `quant_engine/nohup.out` | 6 | `http://127.0.0.1:8000` | Log file |
| `server/.env.example` | | `http://localhost:8000`, `PYTHON_QUANT_ENGINE_URL`... | Will be overridden by runtime discovery |
