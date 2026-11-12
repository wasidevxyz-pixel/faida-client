// Script to check all available branches
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function checkAllBranches() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB\n');

        const db = mongoose.connection.db;
        const storesCollection = db.collection('stores');

        // Get all stores/branches
        const stores = await storesCollection.find({}).toArray();

        console.log('All Branches in System:');
        console.log('=======================');
        stores.forEach((store, i) => {
            console.log(`${i + 1}. ${store.name} (ID: ${store._id})`);
        });

        console.log(`\nTotal: ${stores.length} branches`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkAllBranches();
