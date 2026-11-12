// Migration script to update existing categories to 'item' type
const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Update categories without categoryType
        const result1 = await mongoose.connection.db.collection('categories').updateMany(
            { categoryType: { $exists: false } },
            { $set: { categoryType: 'item' } }
        );
        console.log('Updated', result1.modifiedCount, 'categories without type to "item"');

        // Update categories with 'both' type to 'item'
        const result2 = await mongoose.connection.db.collection('categories').updateMany(
            { categoryType: 'both' },
            { $set: { categoryType: 'item' } }
        );
        console.log('Converted', result2.modifiedCount, 'categories from "both" to "item"');

        console.log('Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
