const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

async function syncStockDetailed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`Total Rows in Excel: ${data.length}`);

        const store = await Store.findOne({ isActive: true });
        if (!store) {
            console.error('No active store found');
            process.exit(1);
        }

        let totalDiff = 0;
        let matchedCount = 0;
        let notFoundCount = 0;
        let updatedCount = 0;

        // Group rows by name to handle duplicates in excel if any
        const excelDataMap = new Map();
        for (const row of data) {
            const name = (row.ItemName || row.name || '').toString().trim();
            const excelStock = parseFloat(row['Stock in Hand'] || row.stock || 0);
            if (name) {
                excelDataMap.set(name, excelStock);
            }
        }

        console.log(`Unique Items in Excel: ${excelDataMap.size}`);

        // Get all items from DB
        const dbItems = await WHItem.find({});
        console.log(`Total Items in DB: ${dbItems.length}`);

        for (const item of dbItems) {
            const itemName = item.name.trim();
            // Look for this DB item in our Excel Map (Case insensitive)
            let excelStock = null;

            // Try exact case first
            if (excelDataMap.has(itemName)) {
                excelStock = excelDataMap.get(itemName);
            } else {
                // Try case-insensitive
                for (let [key, val] of excelDataMap.entries()) {
                    if (key.toLowerCase() === itemName.toLowerCase()) {
                        excelStock = val;
                        break;
                    }
                }
            }

            if (excelStock !== null) {
                matchedCount++;
                const dbStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

                if (dbStock !== excelStock) {
                    // console.log(`Mismatch: "${itemName}" | Excel: ${excelStock} | DB: ${dbStock}`);
                    totalDiff += Math.abs(excelStock - dbStock);

                    // Update Stock
                    if (item.stock && item.stock.length > 0) {
                        item.stock[0].quantity = excelStock;
                        item.stock[0].opening = excelStock;
                    } else {
                        item.stock = [{
                            store: store._id,
                            quantity: excelStock,
                            opening: excelStock
                        }];
                    }

                    item.markModified('stock');
                    await item.save();

                    // Log the change
                    await WHStockLog.create({
                        item: item._id,
                        date: new Date(),
                        type: 'in',
                        qty: excelStock,
                        previousQty: dbStock,
                        newQty: excelStock,
                        refType: 'purchase',
                        refId: item._id,
                        remarks: 'Opening Stock Final Sync V3',
                        createdBy: null
                    });

                    updatedCount++;
                }
            } else {
                // Item in DB but not in Excel
                // console.log(`In DB but not in Excel: "${itemName}"`);
            }
        }

        console.log('\n--- Final Sync Summary ---');
        console.log(`Items Matching Excel/DB: ${matchedCount}`);
        console.log(`Database Records Fixed: ${updatedCount}`);
        console.log(`Total Quantity Difference Corrected: ${totalDiff}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

syncStockDetailed();
