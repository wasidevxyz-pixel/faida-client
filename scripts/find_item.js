const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');

async function findItem() {
    try {
        await mongoose.connect('mongodb://localhost:27017/sales-inventory');
        const item = await WHItem.findOne({ name: /IVYNOL/i });
        if (item) {
            console.log('FOUND:', JSON.stringify(item, null, 2));
        } else {
            console.log('NOT FOUND');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

findItem();
