import mongoose from "mongoose";
mongoose.connect("mongodb://127.0.0.1:27017/aalgolakshmi").then(async () => {
  const db = mongoose.connection.db;
  const s = await db.collection("settings").find().toArray();
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
});
