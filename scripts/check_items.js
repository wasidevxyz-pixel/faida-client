const mongoose = require('mongoose');
const WHItem = require('./Backend/models/WHItem');

async function check() {
    try {
        await mongoose.connect('mongodb://localhost:27017/sales-inventory');
        const items = await WHItem.find({}).limit(5);
        console.log('Sample Items:', JSON.stringify(items, null, 2));

        const withRetail = await WHItem.find({ retailPrice: { $gt: 0 } }).limit(5);
        console.log('Items with Retail Price:', JSON.stringify(withRetail, null, 2));

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
