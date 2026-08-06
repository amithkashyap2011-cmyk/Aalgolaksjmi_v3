import mongoose from 'mongoose';
mongoose.connect('process.env.MONGO_URI').then(async () => {
  const db = mongoose.connection.db;
  const wallets = await db.collection('walletsnapshots').find({}).toArray();
  console.log("Wallets:");
  wallets.forEach(w => console.log(JSON.stringify(w)));
  process.exit(0);
});
