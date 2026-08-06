import WebSocket from 'ws';
const ws = new WebSocket("wss://fstream.binance.com/stream?streams=adausdt@miniTicker");
ws.on('open', () => console.log('Opened!'));
ws.on('message', (msg) => { console.log('Msg:', msg.toString()); ws.close(); });
ws.on('error', (err) => console.log('Error:', err));
