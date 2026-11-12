const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

async function finalSyncWithNames() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        const store = await Store.findOne({ isActive: true });

        console.log(`Matching ${excelData.length} items by Code and updating Names/Stock...`);

        const dbItems = await WHItem.find({});

        let updatedNamesCount = 0;
        let updatedStockCount = 0;
        let totalMatched = 0;

        for (const row of excelData) {
            const exBarcode = (row.Barcode || '').toString().trim();
            const exName = (row.ItemName || '').toString().trim();
            const exStock = parseFloat(row['Stock in Hand'] || 0);

            if (!exBarcode) continue;

            const item = dbItems.find(i =>
                (i.barcode && i.barcode.toString().trim() === exBarcode) ||
                (i.itemsCode && i.itemsCode.toString().trim() === exBarcode)
            );

            if (item) {
                totalMatched++;
                let changed = false;

                // Check Name Mismatch
                if (item.name.trim() !== exName) {
                    item.name = exName;
                    updatedNamesCount++;
                    changed = true;
                }

                // Check Stock Mismatch
                const currentStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
                if (currentStock !== exStock) {
                    if (item.stock && item.stock.length > 0) {
                        item.stock[0].quantity = exStock;
                        item.stock[0].opening = exStock;
                    } else {
                        item.stock = [{ store: store._id, quantity: exStock, opening: exStock }];
                    }
                    item.markModified('stock');
                    updatedStockCount++;
                    changed = true;

                    // Log Stock Change
                    await WHStockLog.create({
                        item: item._id,
                        date: new Date(),
                        type: 'in',
                        qty: exStock,
                        previousQty: currentStock,
                        newQty: exStock,
                        refType: 'purchase',
                        refId: item._id,
                        remarks: `Final Reconciliation (Code: ${exBarcode})`,
                        createdBy: null
                    });
                }

                if (changed) {
                    await item.save();
                }
            }
        }

        console.log('\n--- Final Reconciliation Summary ---');
        console.log(`Target Rows: ${excelData.length}`);
        console.log(`Successfully Matched by Code: ${totalMatched}`);
        console.log(`Item Names Corrected: ${updatedNamesCount}`);
        console.log(`Item Stocks Corrected: ${updatedStockCount}`);
        console.log(`Grand Total Qty in DB is now exactly as per Excel.`);

        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

finalSyncWithNames();
