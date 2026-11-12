const mongoose = require('mongoose');
const WHItem = require('./Backend/models/WHItem');
const WHStockLog = require('./Backend/models/WHStockLog');

async function fix() {
    console.log('Connecting to DB...');
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE', {
        serverSelectionTimeoutMS: 5000
    });
    console.log('Connected.');

    const item = await WHItem.findOne({ $or: [{ itemsCode: '2000' }, { barcode: '2000' }] });
    if (!item) {
        console.log('Item not found');
        process.exit();
    }

    const prev = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
    console.log(`Fixing item: ${item.name}. Prev Stock: ${prev}`);

    if (item.stock && item.stock.length > 0) {
        item.stock[0].quantity = 0;
    } else {
        item.stock = [{ store: null, quantity: 0, opening: 0 }];
    }

    item.markModified('stock');
    await item.save();

    await WHStockLog.create({
        item: item._id,
        type: 'audit',
        qty: -prev,
        previousQty: prev,
        newQty: 0,
        refType: 'audit',
        refId: item._id,
        remarks: 'System Fix: Manual Reset to Zero',
        createdBy: null
    });

    console.log('Stock fixed to zero successfully.');
    process.exit();
}

fix().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});
