const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

function normalize(s) {
    if (!s) return '';
    return s.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

async function highPrecisionSync() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        const store = await Store.findOne({ isActive: true });
        if (!store) {
            console.error('No active store found');
            process.exit(1);
        }

        console.log(`Processing ${excelData.length} items from Excel...`);

        // Get ALL DB items once to avoid repeated queries
        const dbItems = await WHItem.find({});
        console.log(`Database has ${dbItems.length} items.`);

        let matchByCode = 0;
        let matchByName = 0;
        let notFound = 0;
        let updatedCount = 0;
        let totalQtySynced = 0;

        for (const row of excelData) {
            const exBarcode = (row.Barcode || '').toString().trim();
            const exNameRaw = row.ItemName || '';
            const exStock = parseFloat(row['Stock in Hand'] || 0);

            let item = null;

            // 1. Try Match by Code (Barcode)
            if (exBarcode) {
                item = dbItems.find(i =>
                    (i.barcode && i.barcode.toString().trim() === exBarcode) ||
                    (i.itemsCode && i.itemsCode.toString().trim() === exBarcode)
                );
                if (item) matchByCode++;
            }

            // 2. Try Match by Name if not found by code
            if (!item && exNameRaw) {
                const normExName = normalize(exNameRaw);
                item = dbItems.find(i => normalize(i.name) === normExName);
                if (item) matchByName++;
            }

            if (item) {
                const dbStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

                if (dbStock !== exStock) {
                    // Update Item
                    if (item.stock && item.stock.length > 0) {
                        item.stock[0].quantity = exStock;
                        item.stock[0].opening = exStock;
                    } else {
                        item.stock = [{
                            store: store._id,
                            quantity: exStock,
                            opening: exStock
                        }];
                    }

                    item.markModified('stock');
                    await item.save();

                    // Log Change
                    await WHStockLog.create({
                        item: item._id,
                        date: new Date(),
                        type: 'in',
                        qty: exStock,
                        previousQty: dbStock,
                        newQty: exStock,
                        refType: 'purchase',
                        refId: item._id,
                        remarks: `Precise Sync (Code: ${exBarcode || 'N/A'})`,
                        createdBy: null
                    });

                    updatedCount++;
                }
                totalQtySynced += exStock;
            } else {
                notFound++;
                // console.log(`NOT FOUND: [${exBarcode}] "${exNameRaw}"`);
            }
        }

        console.log('\n--- Sync Statistics ---');
        console.log(`Total Excel Rows: ${excelData.length}`);
        console.log(`Matched by Code: ${matchByCode}`);
        console.log(`Matched by Name: ${matchByName}`);
        console.log(`Total Matched: ${matchByCode + matchByName}`);
        console.log(`Not Found: ${notFound}`);
        console.log(`Database Updates Made: ${updatedCount}`);
        console.log(`Grand Total Qty Synced: ${totalQtySynced.toLocaleString()}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

highPrecisionSync();
