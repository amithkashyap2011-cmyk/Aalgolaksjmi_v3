# SERVICE REGISTRY REPORT

## Implementation Details
- **Node.js Registry:** Exposes `/system/register` and `/system/heartbeat`.
- **Quant Engine Client:** Dynamically registers on startup and sends heartbeats every 10s.
- **Source of Truth:** Node.js `SystemManager` now tracks all service coordinates. `port.json` is deprecated but remains as a fallback.

## Status
- [x] /system/register implemented
- [x] /system/heartbeat implemented
- [x] Quant Engine self-registration active
- [x] Heartbeat timeout detection (30s) active
