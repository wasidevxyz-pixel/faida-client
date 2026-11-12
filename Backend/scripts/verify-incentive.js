const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sales-inventory";

(async () => {
    try {
        await mongoose.connect(MONGO_URI, { family: 4 });

        // Find items with non-zero incentive
        const items = await WHItem.find({ incentive: { $gt: 0 } }).limit(5);

        if (items.length > 0) {
            console.log('✅ Found items with incentive:');
            items.forEach(i => console.log(`- ${i.name}: ${i.incentive}`));
        } else {
            console.log('⚠️ No items found with incentive > 0');
            // Show first few items to see what they have
            const all = await WHItem.find().limit(5);
            all.forEach(i => console.log(`- ${i.name}: ${i.incentive} (Raw: ${JSON.stringify(i)})`));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
