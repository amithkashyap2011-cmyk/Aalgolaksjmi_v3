const regimes = { "TRENDING_BULL": 1, "TRENDING_BEAR": -1, "RANGING": 0, "HIGH_VOLATILITY": 2, "TRANSITION": 0.5 };
const sv = [];
sv.push(regimes["TRENDING_BULL"] || 0, 80 / 100, 0, 0, 0); // 5 elements
sv.push(
  1000 / 1000000, 
  10 / 10000, 
  1, 
  0.01 * 1000, 
  50 / 100
); // 5 elements
sv.push(
  1 ? 1 : 0,
  0 ? 1 : 0,
  0 ? 1 : 0,
  0 ? 1 : 0,
  100 / 100
); // 5 elements
sv.push(0, 0); // 2 elements
sv.push(
  100 > 0 ? 1 : 0,
  90 / 100,
  110 / 100,
  0, 0
); // 5 elements
sv.push(
  50 / 100,
  20 / 100,
  10 / 100,
  1 / 100,
  100 / 100
); // 5 elements
console.log("Before padding length:", sv.length);
while (sv.length < 32) sv.push(0);
console.log("After padding length:", sv.length);
