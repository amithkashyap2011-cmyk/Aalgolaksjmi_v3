import WebSocket from 'ws';

const ws = new WebSocket('wss://fstream.binance.com/stream?streams=btcusdt@miniTicker');

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  const payload = JSON.parse(data.toString());
  console.log(payload);
  ws.close();
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout");
  process.exit(1);
}, 5000);
