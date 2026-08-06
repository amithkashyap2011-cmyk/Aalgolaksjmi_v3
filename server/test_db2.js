import mongoose from 'mongoose';
mongoose.connect('process.env.MONGO_URI').then(async () => {
  const db = mongoose.connection.db;
  const trades = await db.collection('trades').find({}).toArray();
  const openTrades = await db.collection('trades').find({status: "OPEN"}).toArray();
  console.log("Total Trades:", trades.length);
  console.log("Open Trades:", openTrades.length);
  process.exit(0);
});
