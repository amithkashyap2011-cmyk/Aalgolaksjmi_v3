
async function testPublic() {
  const BASE = "https://api.binance.com";
  const FUTURES_BASE = "https://fapi.binance.com";
  
  console.log("Testing Binance Public Endpoints...");
  
  try {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/v3/ping`);
    const end = Date.now();
    console.log(`- Spot Ping: ${res.ok ? "OK" : "FAILED"} (${end - start}ms)`);
  } catch (e) {
    console.log(`- Spot Ping ERROR: ${e.message}`);
  }

  try {
    const start = Date.now();
    const res = await fetch(`${FUTURES_BASE}/fapi/v1/ping`);
    const end = Date.now();
    console.log(`- Futures Ping: ${res.ok ? "OK" : "FAILED"} (${end - start}ms)`);
  } catch (e) {
    console.log(`- Futures Ping ERROR: ${e.message}`);
  }

  try {
    const res = await fetch(`${BASE}/api/v3/time`);
    const data = await res.json();
    console.log(`- Spot Time: ${data.serverTime} (Local: ${Date.now()})`);
  } catch (e) {
    console.log(`- Spot Time ERROR: ${e.message}`);
  }
}

testPublic();
