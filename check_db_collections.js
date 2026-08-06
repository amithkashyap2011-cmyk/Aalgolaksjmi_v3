const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log("Collections and doc counts:");
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`- ${col.name}: ${count} docs`);
  }

  // If there's an aqeaaudits or similar collection, let's look at the last 5 docs
  const auditColName = collections.find(c => c.name.includes('audit') || c.name.includes('decision'))?.name;
  if (auditColName) {
    console.log(`\nLast 3 docs from ${auditColName}:`);
    const docs = await db.collection(auditColName).find({}).sort({ timestamp: -1 }).limit(3).toArray();
    console.log(JSON.stringify(docs, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
