import axios from 'axios';

const NODE_URL = "process.env.API_GATEWAY_URL";

async function runChaos() {
  console.log("=== AQEA CHAOS TEST INITIATED ===");
  
  try {
    // 1. Initial State Check
    console.log("[TEST] Checking initial state...");
    const resInitial = await fetch(`${NODE_URL}/system/status`);
    const initial = await resInitial.json() as any;
    console.log(`Current State: ${initial.state}`);

    // 2. Simulate Quant Heartbeat Loss
    console.log("[TEST] Simulating Quant Engine Heartbeat Loss...");
    // We wait 35 seconds to trigger the 30s timeout in SystemManager
    console.log("Waiting 35 seconds for heartbeat timeout...");
    await new Promise(resolve => setTimeout(resolve, 35000));
    
    const resLost = await fetch(`${NODE_URL}/system/status`);
    const lostState = await resLost.json() as any;
    console.log(`State after timeout: ${lostState.state}`);
    if (lostState.state === "RECOVERING") {
      console.log("✅ SUCCESS: System entered RECOVERING state on Quant loss.");
    } else {
      console.error(`❌ FAILURE: System failed to enter RECOVERING state. Current: ${lostState.state}`);
    }

    // 3. Simulate Quant Re-registration
    console.log("[TEST] Simulating Quant Engine Re-registration...");
    await fetch(`${NODE_URL}/system/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "quant_engine",
        url: "process.env.API_GATEWAY_URL",
        version: "11.5.0-chaos",
        health: { status: "Online" }
      })
    });
    
    // Node should move to WAITING_FOR_BINANCE and then READY (if binance is ok)
    await new Promise(resolve => setTimeout(resolve, 5000));
    const resRecovered = await fetch(`${NODE_URL}/system/status`);
    const recoveredState = await resRecovered.json() as any;
    console.log(`State after re-registration: ${recoveredState.state}`);
    if (recoveredState.state === "READY" || recoveredState.state === "WAITING_FOR_BINANCE") {
      console.log("✅ SUCCESS: System recovered or is proceeding to READY.");
    } else {
      console.error(`❌ FAILURE: System stuck in invalid state: ${recoveredState.state}`);
    }

    // 4. Test Trading Circuit Breaker
    console.log("[TEST] Verifying Trading Circuit Breaker...");
    // Manually set to EMERGENCY_STOP
    await fetch(`${NODE_URL}/system/emergency-stop`, { method: "POST" });
    const resTrading = await fetch(`${NODE_URL}/trading/status`);
    if (resTrading.status === 503) {
      console.log("✅ SUCCESS: Trading route blocked (503) during EMERGENCY_STOP.");
    } else {
      console.error(`❌ FAILURE: Trading route not blocked as expected. Status: ${resTrading.status}`);
    }

    console.log("=== CHAOS TEST COMPLETE ===");
    process.exit(0);
  } catch (err: any) {
    console.error(`[CHAOS_ERROR] ${err.stack || err.message || err}`);
    process.exit(1);
  }
}

runChaos();
