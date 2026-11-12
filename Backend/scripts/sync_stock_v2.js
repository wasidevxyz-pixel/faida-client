const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

async function syncStock() {
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

        for (const row of data) {
            const name = row.ItemName || row.name;
            const excelStock = parseFloat(row['Stock in Hand'] || row.stock || 0);

            if (!name) continue;

            const item = await WHItem.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });

            if (item) {
                matchedCount++;
                const dbStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

                if (dbStock !== excelStock) {
                    console.log(`Mismatch: "${name}" | Excel: ${excelStock} | DB: ${dbStock} | Diff: ${excelStock - dbStock}`);
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
                        type: 'in',
                        qty: excelStock,
                        previousQty: dbStock,
                        newQty: excelStock,
                        refType: 'purchase',
                        refId: item._id,
                        remarks: 'Opening Stock Sync from Excel script',
                        createdBy: null // Background script
                    });

                    updatedCount++;
                }
            } else {
                notFoundCount++;
                // console.log(`Not Found: "${name}"`);
            }
        }

        console.log('\n--- Sync Summary ---');
        console.log(`Matched Items: ${matchedCount}`);
        console.log(`Updated Items: ${updatedCount}`);
        console.log(`Not Found In DB: ${notFoundCount}`);
        console.log(`Total Quantity Absolute Difference Fixed: ${totalDiff}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

syncStock();
