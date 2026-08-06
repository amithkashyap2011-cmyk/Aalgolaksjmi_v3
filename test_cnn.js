import { CNNPredictor } from "./server/build/services/aqea/ai/CNNPredictor.js";

const cnn = new CNNPredictor();

const fv = {
  symbol: "BTCUSDT",
  market: {
    open: 60000, high: 61000, low: 59000, close: 60500, volume: 100,
    bars: [ { close: 60000, volume: 100 } ]
  }
};

cnn.predict(fv).then(console.log).catch(console.error);
