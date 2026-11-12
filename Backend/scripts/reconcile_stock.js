const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

async function reconcile() {
    try {
        await mongoose.connect(MONGO_URI);

        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        const excelMap = new Map();
        let excelTotal = 0;
        for (const row of excelData) {
            const name = (row.ItemName || row.name || '').toString().trim().toLowerCase();
            const stock = parseFloat(row['Stock in Hand'] || row.stock || 0);
            if (name) {
                // If duplicates in excel, aggregate them
                excelMap.set(name, (excelMap.get(name) || 0) + stock);
                excelTotal += stock;
            }
        }

        const dbItems = await WHItem.find({});
        let dbTotal = 0;
        let matchedStockExcel = 0;
        let matchedStockDB = 0;
        let extraDBItems = [];
        let matchedItems = [];

        for (const item of dbItems) {
            const name = item.name.trim().toLowerCase();
            const stock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
            dbTotal += stock;

            if (excelMap.has(name)) {
                const exStock = excelMap.get(name);
                matchedItems.push({ name: item.name, excel: exStock, db: stock });
                matchedStockExcel += exStock;
                matchedStockDB += stock;
                excelMap.delete(name); // Remove matched from excelMap
            } else {
                extraDBItems.push({ name: item.name, stock: stock });
            }
        }

        // Remaining in excelMap are missing from DB
        let missingItems = [];
        let missingTotal = 0;
        for (let [name, stock] of excelMap.entries()) {
            missingItems.push({ name, stock });
            missingTotal += stock;
        }

        console.log(`\n--- RECONCILIATION SUMMARY ---`);
        console.log(`Excel Total Stock (Calculated): ${excelTotal}`);
        console.log(`DB Total Stock (Calculated): ${dbTotal}`);
        console.log(`Difference (Excel - DB): ${excelTotal - dbTotal}`);

        console.log(`\n--- 1. Items in Excel but MISSING from DB (Total: ${missingItems.length}) ---`);
        missingItems.sort((a, b) => b.stock - a.stock);
        missingItems.slice(0, 20).forEach(m => console.log(`"${m.name}": ${m.stock}`));
        console.log(`Subtotal Missing: ${missingTotal}`);

        console.log(`\n--- 2. Items in DB but NOT in Excel (Total: ${extraDBItems.length}) ---`);
        extraDBItems.sort((a, b) => b.stock - a.stock);
        extraDBItems.slice(0, 20).forEach(e => console.log(`"${e.name}": ${e.stock}`));
        console.log(`Subtotal Extra DB: ${extraDBItems.reduce((a, b) => a + b.stock, 0)}`);

        console.log(`\n--- 3. Mismatched Stock (Both exist but different) ---`);
        let mismatchCount = 0;
        matchedItems.filter(m => m.excel !== m.db).forEach(m => {
            mismatchCount++;
            if (mismatchCount <= 20) console.log(`"${m.name}" | Excel: ${m.excel} | DB: ${m.db} | Diff: ${m.excel - m.db}`);
        });

        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

reconcile();
