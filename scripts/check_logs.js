const mongoose = require('mongoose');
const WHItem = require('./Backend/models/WHItem');
const WHStockLog = require('./Backend/models/WHStockLog');

async function check() {
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    const item = await WHItem.findOne({ $or: [{ itemsCode: '2000' }, { barcode: '2000' }] });
    if (!item) {
        console.log('Item not found');
        return;
    }
    console.log('--- ITEM DETAILS ---');
    console.log('Name:', item.name);
    console.log('Current Stock:', item.stock[0].quantity);

    const logs = await WHStockLog.find({ item: item._id }).sort({ createdAt: -1 }).limit(20);
    console.log('\n--- RECENT STOCK LOGS ---');
    logs.forEach(log => {
        console.log(`${log.createdAt.toISOString()} | Type: ${log.type} | Qty: ${log.qty} | Prev: ${log.previousQty} | New: ${log.newQty} | Ref: ${log.refType} | Remarks: ${log.remarks}`);
    });

    process.exit();
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
