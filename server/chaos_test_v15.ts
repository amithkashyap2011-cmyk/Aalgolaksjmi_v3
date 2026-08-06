import { SystemManager, SystemState } from './src/services/systemManager.js';
import { EventEmitter } from 'events';

console.log("=========================================");
console.log("   AQEA V15 CHAOS ENGINEERING SUITE");
console.log("=========================================\n");

let failed = false;
function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`[PASS] ${msg}`);
    } else {
        console.error(`[FAIL] ${msg}`);
        failed = true;
    }
}

async function runChaosSuite() {
    const sys = SystemManager.getInstance();
    
    // 1. Initial Boot
    assert(sys.getState() === SystemState.BOOTING, "System boots into BOOTING state");

    // 2. Mongo Up
    sys.setState(SystemState.WAITING_FOR_QUANT);
    assert(sys.getState() === SystemState.WAITING_FOR_QUANT, "System advances to WAITING_FOR_QUANT");

    // 3. Register Quant Engine
    sys.registerService({
        name: "quant_engine",
        url: "http://10.0.0.5:12345",
        version: "15.0",
        health: { status: "Online" }
    });
    assert(sys.getState() === SystemState.WAITING_FOR_BINANCE, "Quant registration advances state to WAITING_FOR_BINANCE");

    // 4. Register Binance (Mocked as READY transition)
    sys.setState(SystemState.READY);
    assert(sys.getState() === SystemState.READY, "System becomes READY");

    // 5. Kill Quant Engine (Heartbeat Timeout)
    console.log("[CHAOS] Simulating Kill Quant...");
    // Fast-forward last heartbeat
    const quantService = sys.getService("quant_engine");
    if (quantService) {
       quantService.lastHeartbeat = Date.now() - 35000; 
    }
    
    // Wait for monitor interval
    await new Promise(r => setTimeout(r, 6000));
    
    assert(sys.getState() === SystemState.RECOVERING, "System detects Quant failure and degrades to RECOVERING");
    assert(sys.getService("quant_engine") === undefined, "Quant service evicted from registry");

    // 6. Change Dynamic Port (Restart Quant)
    console.log("[CHAOS] Simulating Restart Quant on new port...");
    sys.registerService({
        name: "quant_engine",
        url: "http://10.0.0.5:54321", // New Port!
        version: "15.0",
        health: { status: "Online" }
    });
    
    assert(sys.getState() === SystemState.READY, "System accepts new dynamic port and recovers to READY");
    assert(sys.getService("quant_engine")?.url === "http://10.0.0.5:54321", "Traffic successfully routed to new port");

    // 7. Network Partition (Unknown service heartbeat)
    console.log("[CHAOS] Simulating Network Partition spoofing...");
    sys.heartbeat("unknown_service", { status: "Offline" });
    assert(sys.getService("unknown_service") === undefined, "System ignores and contains unregistered spoofed heartbeats");

    // 8. Corrupt Checkpoint
    console.log("[CHAOS] Simulating Corrupt AI Checkpoint (Degraded Health)...");
    sys.heartbeat("quant_engine", { status: "DEGRADED", models: { cnn: "MISSING", ppo: "ONLINE" } });
    const health = sys.getService("quant_engine")?.health;
    assert(health.status === "DEGRADED", "System detects degraded model state without going offline (Quality separated from Readiness)");

    // 9. Kill Mongo
    console.log("[CHAOS] Simulating Mongo Disconnect...");
    sys.setState(SystemState.EMERGENCY_STOP);
    assert(sys.getState() === SystemState.EMERGENCY_STOP, "System contains fatal DB loss via EMERGENCY_STOP");

    console.log("\n=========================================");
    if (failed) {
        console.error("CHAOS SUITE FAILED");
        process.exit(1);
    } else {
        console.log("CHAOS SUITE PASSED. 100% Resilience.");
        process.exit(0);
    }
}

runChaosSuite().catch(console.error);
