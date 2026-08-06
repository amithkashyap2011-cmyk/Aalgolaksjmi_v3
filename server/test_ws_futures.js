import WebSocket from 'ws';

const ws = new WebSocket('wss://fstream.binance.com/stream?streams=btcusdt@miniTicker');

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  console.log(JSON.parse(data.toString()));
  ws.close();
  process.exit(0);
});
