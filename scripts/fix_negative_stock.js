const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');
const WHStockLog = require('./models/WHStockLog');

async function fixNegativeStock() {
    try {
        await mongoose.connect('mongodb://localhost:27017/BAS-SOFTWARE');
        console.log('Connected to DB');

        const items = await WHItem.find({ 'stock.quantity': { $lt: 0 } });
        console.log(`Found ${items.length} items with negative stock.`);

        for (const item of items) {
            const oldQty = item.stock[0].quantity;
            item.stock[0].quantity = 0;
            item.markModified('stock');
            await item.save();

            try {
                await WHStockLog.create({
                    item: item._id,
                    type: 'audit',
                    qty: Math.abs(oldQty),
                    previousQty: oldQty,
                    newQty: 0,
                    refType: 'audit',
                    refId: item._id, // Using item ID as a placeholder refId for auto-fix
                    remarks: 'Auto-Fix: Corrected negative stock to 0',
                    createdBy: null
                });
                console.log(`Fixed Item: ${item.name} (${item.itemsCode}) from ${oldQty} to 0`);
            } catch (logErr) {
                console.error(`Log creation failed for ${item.name}: ${logErr.message}`);
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
}

fixNegativeStock();
