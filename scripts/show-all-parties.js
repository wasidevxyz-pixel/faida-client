// Script to show ALL parties and their branches
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function showAllParties() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB\n');

        const db = mongoose.connection.db;
        const partiesCollection = db.collection('parties');

        // Get total count
        const total = await partiesCollection.countDocuments();
        console.log(`Total parties in database: ${total}\n`);

        // Get all parties
        const parties = await partiesCollection.find({}).limit(20).toArray();

        console.log('First 20 parties:');
        console.log('=================');
        parties.forEach((p, i) => {
            console.log(`${i + 1}. ${p.name}`);
            console.log(`   Branch: "${p.branch}"`);
            console.log(`   Type: ${p.partyType}`);
            console.log(`   Code: ${p.code}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

showAllParties();
