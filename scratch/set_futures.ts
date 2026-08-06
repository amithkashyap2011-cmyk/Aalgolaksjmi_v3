import mongoose from "mongoose";
import { User } from "../server/src/models/User";
import { Settings } from "../server/src/models/Settings";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const user = await User.findOne({ username: "aalgolakshmi_admin" });
  if (user) {
    await Settings.updateOne({ userId: user._id }, { accountType: "FUTURES" });
    console.log("Account type updated to FUTURES in DB");
  } else {
    // If we don't know the exact user, just update all settings documents
    const res = await Settings.updateMany({}, { accountType: "FUTURES" });
    console.log(`Updated ${res.modifiedCount} settings to FUTURES`);
  }
  process.exit(0);
}
run().catch(console.error);
