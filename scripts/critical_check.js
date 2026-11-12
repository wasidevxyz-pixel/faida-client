const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');

async function checkItem() {
    try {
        await mongoose.connect('mongodb://localhost:27017/BAS-SOFTWARE');
        const item = await WHItem.findOne({ itemsCode: '2000' });
        if (item) {
            console.log(`CRITICAL_CHECK: Item ${item.itemsCode} Name: ${item.name} Stock: ${item.stock[0].quantity}`);
        } else {
            console.log('CRITICAL_CHECK: NOT FOUND');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkItem();
