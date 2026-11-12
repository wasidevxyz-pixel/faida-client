const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const readline = require('readline');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const resetDb = async () => {
    await connectDB();

    console.log('WARNING: This script will WIPE most data from the database.');
    console.log('It will KEEP: Departments, Users, Groups, Banks, Settings, and Stores.');
    console.log('All other collections will be cleared.');

    const collectionsToKeep = [
        'departments',
        'users',
        'groups',
        'banks',
        'settings',
        'stores'
    ];

    // Get all collections
    const collections = await mongoose.connection.db.collections();

    for (let collection of collections) {
        if (!collectionsToKeep.includes(collection.collectionName)) {
            try {
                const count = await collection.countDocuments();
                if (count > 0) {
                    await collection.deleteMany({});
                    console.log(`Cleared ${collection.collectionName} (${count} documents removed)`);
                } else {
                    console.log(`Skipped ${collection.collectionName} (Already empty)`);
                }
            } catch (err) {
                console.error(`Error clearing ${collection.collectionName}:`, err.message);
            }
        } else {
            const count = await collection.countDocuments();
            console.log(`KEPT ${collection.collectionName} (${count} documents preserved)`);
        }
    }

    console.log('Database cleanup complete.');
    process.exit();
};

// Auto-run if executed
resetDb();
