const WebSocket = require('./node_modules/ws');
const symbols = ["XRPUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"];
const allStreams = symbols.flatMap(sym => {
  const lower = sym.toLowerCase();
  if (lower === '1000shibusdt') {
      //
  }
  let binSym = lower;
  if (sym === "SHIBUSDT") binSym = "1000shibusdt";
  return [
    `${binSym}@miniTicker`,
    `${binSym}@depth5`,
    `${binSym}@aggTrade`,
  ];
});
const streamUrl = "wss://fstream.binance.com/stream?streams=" + allStreams.join("/");
console.log("Connecting to:", streamUrl);
const ws = new WebSocket(streamUrl);
ws.on('open', () => { console.log('open'); ws.close(); });
ws.on('error', (e) => console.log('error', e.message));
