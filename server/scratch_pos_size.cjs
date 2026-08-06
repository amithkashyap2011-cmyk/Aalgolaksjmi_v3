const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/aalgolakshmi');
  const Settings = mongoose.model('Settings', new mongoose.Schema({}, { strict: false }));
  
  const result = await Settings.updateMany({}, {
    $set: { 'riskConfig.maxPositionSizePct': 99 }
  });
  
  console.log(`Updated ${result.modifiedCount} settings documents to 99% maxPositionSizePct.`);
  process.exit(0);
}

run().catch(console.error);
