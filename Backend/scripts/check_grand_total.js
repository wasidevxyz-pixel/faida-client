const mongoose = require('mongoose');
const WHItem = require('../models/WHItem');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function checkTotal() {
    try {
        await mongoose.connect(MONGO_URI);
        const items = await WHItem.find({});
        let total = 0;
        items.forEach(item => {
            total += (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
        });
        console.log(`Current Grand Total Qty in DB: ${total.toLocaleString()}`);
        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

checkTotal();
