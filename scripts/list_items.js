const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');

async function listItems() {
    try {
        await mongoose.connect('mongodb://localhost:27017/sales-inventory');
        const items = await WHItem.find({}, 'itemsCode name barcode');
        items.forEach(it => {
            console.log(`Code: ${it.itemsCode} | Barcode: ${it.barcode} | Name: ${it.name}`);
        });
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

listItems();
