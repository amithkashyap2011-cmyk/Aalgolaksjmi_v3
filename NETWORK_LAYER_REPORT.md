# NETWORK_LAYER_REPORT.md

## Network Configuration Audit

### 1. Express CORS
- **Current Configuration:** `app.use(cors())`. This is highly permissive and allows any origin.
- **Recommendation:** Restrict to `http://localhost:9993` in production-like environments to improve security.
- **WebSocket CORS:** `io = new IOServer(server, { cors: { origin: "*", ... } })`. Also permissive.

### 2. Connectivity Issues
- **Observation:** `curl http://127.0.0.1:9991/health` failed with "Connection refused".
- **Root Cause:** The backend process is not currently running.
- **Implication:** The reported "intermittent crashes" are likely true crashes where the process exits and is not restarted, or it never successfully started due to the fatal `process.exit(1)` calls in the original `boot()` sequence.

### 3. Port & Binding
- **Port:** 9991.
- **Binding:** `0.0.0.0` (all interfaces). This is correct for accessibility across containers or network boundaries.

### 4. Middleware Chain
- `express.json()` is present.
- `cors()` is placed early in the middleware chain, which is correct for handling preflight `OPTIONS` requests.

## Test Results
- [ ] OPTIONS localhost:9991: TBD (Requires backend running)
- [ ] POST localhost:9991/apikeys/save: TBD (Requires backend running)

## Summary
The network layer configuration is fundamentally correct but very permissive. The primary reason for "unreachability" is that the backend process is not active. The stabilization fixes in Phase 2 should help keep the process alive or at least provide better logs when it fails.
