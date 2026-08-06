const { MongoClient } = require('mongodb');

async function fix() {
  const url = 'process.env.MONGO_URI';
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db('aalgolakshmi');
    const collection = db.collection('walletsnapshots');
    await collection.dropIndexes();
    console.log('INDEXES_DROPPED');
    await collection.createIndex({ userId: 1, mode: 1, accountType: 1 }, { unique: true });
    console.log('INDEX_CREATED');
  } catch (err) {
    console.log('ERROR: ' + err.message);
  } finally {
    await client.close();
  }
}

fix();
