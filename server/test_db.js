import mongoose from 'mongoose';
mongoose.connect('process.env.MONGO_URI').then(async () => {
  const db = mongoose.connection.db;
  const trades = await db.collection('trades').find({ status: "CLOSED" }).toArray();
  const txns = await db.collection('wallettransactions').find({}).toArray();
  let pnl = 0;
  trades.forEach(t => pnl += (t.pnl || 0));
  let dep = 0, wd = 0;
  txns.forEach(t => {
    if (t.type === 'DEPOSIT') dep += t.amount;
    if (t.type === 'WITHDRAW') wd += t.amount;
  });
  console.log("Closed Trades:", trades.length);
  console.log("Total Realized PnL:", pnl);
  console.log("Deposits:", dep);
  console.log("Withdrawals:", wd);
  process.exit(0);
});
