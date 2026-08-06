import WebSocket from "ws";

function testWs(url: string) {
  console.log("Connecting to:", url);
  const ws = new WebSocket(url);
  let gotMsg = false;
  ws.on("open", () => {
    console.log("OPEN:", url);
  });
  ws.on("message", (data) => {
    if (!gotMsg) {
      console.log("MSG from", url, ":", data.toString().substring(0, 50));
      gotMsg = true;
      ws.close();
    }
  });
  ws.on("error", (err) => console.log("ERR:", url, err.message));
  setTimeout(() => { if (!gotMsg) { console.log("TIMEOUT:", url); ws.close(); } }, 5000);
}

testWs("wss://fstream.binance.info/ws/btcusdt@miniTicker");
testWs("wss://fstream.binanceapi.com/ws/btcusdt@miniTicker");
testWs("wss://fstream.binance.vision/ws/btcusdt@miniTicker");
