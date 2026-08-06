import WebSocket from 'ws';
const ws = new WebSocket("wss://fstream.binance.com/stream?streams=bnbusdt@miniTicker");
ws.on('open', () => {
  console.log('Opened! Subscribing to ADAUSDT...');
  ws.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["adausdt@miniTicker", "adausdt@depth5", "adausdt@aggTrade"],
    id: 1
  }));
});
ws.on('message', (msg) => { 
  const txt = msg.toString();
  if (txt.includes('adausdt')) {
    console.log('Got ADAUSDT Msg:', txt);
    ws.close();
  } else {
    console.log('Got Msg:', txt);
  }
});
ws.on('error', (err) => console.log('Error:', err));
