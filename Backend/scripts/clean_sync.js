const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

function normalize(s) {
    return (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

async function cleanSync() {
    try {
        await mongoose.connect(MONGO_URI);
        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        const store = await Store.findOne({ isActive: true });

        // 1. Map Excel items
        const excelMap = new Map();
        let excelTotal = 0;
        for (const row of excelData) {
            const name = normalize(row.ItemName || row.name);
            const qty = parseFloat(row['Stock in Hand'] || row.stock || 0);
            if (name) {
                excelMap.set(name, (excelMap.get(name) || 0) + qty);
                excelTotal += qty;
            }
        }

        // 2. Get all DB items
        const dbItems = await WHItem.find({});
        let matchedCount = 0;
        let zeroedCount = 0;
        let dbTotalAfter = 0;

        for (const item of dbItems) {
            const normName = normalize(item.name);
            const currentQty = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
            let targetQty = 0;

            if (excelMap.has(normName)) {
                targetQty = excelMap.get(normName);
                matchedCount++;
                excelMap.delete(normName); // Mark as found
            } else {
                targetQty = 0; // Not in Excel, should be 0
                if (currentQty > 0) zeroedCount++;
            }

            if (currentQty !== targetQty) {
                if (item.stock && item.stock.length > 0) {
                    item.stock[0].quantity = targetQty;
                    item.stock[0].opening = targetQty;
                } else {
                    item.stock = [{ store: store._id, quantity: targetQty, opening: targetQty }];
                }
                item.markModified('stock');
                await item.save();

                await WHStockLog.create({
                    item: item._id,
                    type: targetQty > currentQty ? 'in' : 'out',
                    qty: targetQty,
                    previousQty: currentQty,
                    newQty: targetQty,
                    refType: 'purchase',
                    refId: item._id,
                    remarks: 'Clean Sync to Match Excel Exactly',
                    createdBy: null
                });
            }
            dbTotalAfter += targetQty;
        }

        console.log(`\n--- Final Clean Sync Results ---`);
        console.log(`Target Total in Excel: ${excelTotal.toLocaleString()}`);
        console.log(`Current Total in DB: ${dbTotalAfter.toLocaleString()}`);
        console.log(`Matched Items: ${matchedCount}`);
        console.log(`Items Zeroed Out (Not in Excel): ${zeroedCount}`);
        console.log(`Difference (Missing Items): ${(excelTotal - dbTotalAfter).toLocaleString()}`);

        if (excelMap.size > 0) {
            console.log(`\n--- Items Missing from DB (${excelMap.size}) ---`);
            for (let [name, qty] of excelMap.entries()) {
                console.log(`- "${name}": ${qty}`);
            }
        }

        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

cleanSync();
