import mongoose from "mongoose";
import { ApiKeys } from "./src/models/ApiKeys.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const keys = await ApiKeys.find({});
  console.log("Keys in DB:", keys);
  process.exit(0);
}
run();
