import { subscribeTicker, getTickerPrice } from './src/services/binanceService.ts';

// We need an io mock
const mockIo = { emit: (event, data) => console.log(event, data) };
subscribeTicker('BTCUSDT', mockIo, true);

setTimeout(() => {
  console.log("Timeout");
  process.exit(1);
}, 5000);
