const regimes = { "TRENDING_BULL": 1, "TRENDING_BEAR": -1, "RANGING": 0, "HIGH_VOLATILITY": 2, "TRANSITION": 0.5 };
const fv = {
  regime: { state: "TRENDING_BULL", score: 80 },
  orderFlow: { cvd: 1, delta: 1, oiExpansion: 1, fundingRate: 1, liquidationScore: 1 },
  smartMoney: { liquiditySweep: true, bos: false, orderBlock: true, fvg: false, poc: 1 },
  market: { close: 1, rsi: 50, adx: 20, atr: 1, macd: 1, ema200: 1 },
  execution: { positionSize: 1, stopLoss: 1, takeProfit: 1 }
};
const sv = [];
sv.push(regimes[fv.regime.state] || 0, fv.regime.score / 100, 0, 0, 0);
sv.push(
  fv.orderFlow.cvd / 1000000, 
  fv.orderFlow.delta / 10000, 
  fv.orderFlow.oiExpansion, 
  fv.orderFlow.fundingRate * 1000, 
  fv.orderFlow.liquidationScore / 100
);
sv.push(
  fv.smartMoney.liquiditySweep ? 1 : 0,
  fv.smartMoney.bos ? 1 : 0,
  fv.smartMoney.orderBlock ? 1 : 0,
  fv.smartMoney.fvg ? 1 : 0,
  fv.smartMoney.poc / fv.market.close
);
sv.push(0, 0);
sv.push(
  fv.execution.positionSize > 0 ? 1 : 0,
  fv.execution.stopLoss / fv.market.close,
  fv.execution.takeProfit / fv.market.close,
  0, 0
);
sv.push(
  fv.market.rsi / 100,
  fv.market.adx / 100,
  fv.market.atr / fv.market.close,
  fv.market.macd / fv.market.close,
  fv.market.close / fv.market.ema200
);
while (sv.length < 30) sv.push(0); // wait... what if it was 30?!
console.log(sv.length);
