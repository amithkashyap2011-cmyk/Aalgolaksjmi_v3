const fs = require('fs');

const raw = fs.readFileSync('last_1000_trades.json', 'utf8');

try {
  let trades;
  const jsCode = raw
    .replace(/ObjectId\('([^']+)'\)/g, '"$1"')
    .replace(/ISODate\('([^']+)'\)/g, '"$1"');
  
  eval(`trades = ${jsCode}`);

  let fakeTP3 = 0;
  
  trades.forEach(t => {
    const reason = t.meta && t.meta.exitReason ? t.meta.exitReason : "UNKNOWN";
    if (reason === "TP3_HIT" && t.pnl <= 0) {
        fakeTP3++;
    }
  });

  console.log(`Fake TP3 Hits (TP3 logged but PnL <= 0): ${fakeTP3}`);
  
} catch(e) {
  console.error(e);
}
