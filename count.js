const fs = require('fs');

const raw = fs.readFileSync('last_1000_trades.json', 'utf8');
const jsCode = raw.replace(/ObjectId\('([^']+)'\)/g, '"$1"').replace(/ISODate\('([^']+)'\)/g, '"$1"');
let trades;
eval(`trades = ${jsCode}`);

const cnnHoldCount = trades.filter(t => t.meta?.aqea?.cnnDecision === 'HOLD').length;
const cnnMatchCount = trades.filter(t => t.meta?.aqea?.cnnDecision === t.side).length;
const cnnMismatchCount = trades.filter(t => t.meta?.aqea?.cnnDecision !== t.side).length;

console.log('CNN HOLD count:', cnnHoldCount);
console.log('CNN Match count:', cnnMatchCount);
console.log('CNN Mismatch count:', cnnMismatchCount);
console.log('Total trades:', trades.length);
