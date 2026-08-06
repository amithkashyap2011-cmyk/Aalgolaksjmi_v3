const fs = require('fs');

// Define mongo shell types
function ObjectId(str) { return str; }
function ISODate(str) { return new Date(str); }

console.log("Reading last_1000_audits.json...");
const raw = fs.readFileSync('last_1000_audits.json', 'utf-8');

console.log("Parsing...");
const records = eval('(' + raw + ')');
console.log(`Total records: ${records.length}`);

// Sort by timestamp descending
records.sort((a, b) => b.timestamp - a.timestamp);

console.log("Top 5 records:");
for (let i = 0; i < 5; i++) {
    const r = records[i];
    if (!r) break;
    console.log(`${i}: ${r.symbol} - ${r.timestamp.toISOString()} - Msg: ${r.message}`);
    console.log(JSON.stringify(r.data, null, 2).substring(0, 300));
}
