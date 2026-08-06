# SERVICE DISCOVERY ROOT CAUSE REPORT

## Symptom
The Node.js server was unable to discover the Quant Engine service, despite the `port.json` file being present and correctly populated by the Quant Engine. The server logged: `[ServiceDiscovery] Could not discover Quant Engine. Using default fallback.`

## Root Cause
The path resolution for `port.json` in `server/src/config/serviceDiscovery.ts` was using a fragile relative path:
`path.resolve(__dirname, '../../../../quant_engine/runtime/port.json')`

Analysis:
1. `__dirname` was resolved to `/Users/amithks/aalgolakshmi_v2/server/src/config`.
2. `../../../../` went up 4 levels:
   - `..` -> `server/src/`
   - `..` -> `server/`
   - `..` -> `aalgolakshmi_v2/` (Project Root)
   - `..` -> `/Users/amithks/` (One level above root)
3. The resulting path was `/Users/amithks/quant_engine/runtime/port.json`, which does not exist.
4. The actual file is at `/Users/amithks/aalgolakshmi_v2/quant_engine/runtime/port.json`.

## Fix Implemented
1. Replaced the fragile `__dirname` relative path with a robust `process.cwd()` based path:
   `const PORT_FILE_PATH = path.resolve(process.cwd(), 'quant_engine/runtime/port.json');`
2. Added startup telemetry logs to provide visibility into:
   - Current working directory (`cwd`)
   - Resolved `port_file` path
   - File existence check (`exists`)
   - Discovered port value
3. Verified the fix with a dedicated script (`server/src/config/verify_fix.ts`).

## Verification Results
- `cwd`: `/Users/amithks/aalgolakshmi_v2`
- `port_file`: `/Users/amithks/aalgolakshmi_v2/quant_engine/runtime/port.json`
- `exists`: `true`
- `discovered_port`: `62388`
- `status`: SUCCESS

## Prevention
Avoid using deeply nested relative paths (`../../../../`) which are sensitive to changes in project structure or deployment environment. Prefer using `process.cwd()` for project-relative paths or define a root-level constant for path resolution.
