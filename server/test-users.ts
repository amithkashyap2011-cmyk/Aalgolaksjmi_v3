import mongoose from "mongoose";
import { User } from "./src/models/User.js";
import { ApiKeys } from "./src/models/ApiKeys.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const users = await User.find({});
  const keys = await ApiKeys.find({});
  console.log("Users:", users.map(u => ({ id: u._id, email: u.email })));
  console.log("Keys:", keys.map(k => ({ id: k._id, userId: k.userId })));
  process.exit(0);
}
run();
