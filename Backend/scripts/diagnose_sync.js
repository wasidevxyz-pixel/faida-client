const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

function normalize(s) {
    if (!s) return '';
    return s.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

async function diagnose() {
    try {
        await mongoose.connect(MONGO_URI);
        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        console.log(`Excel Rows: ${excelData.length}`);

        // Print first 10 excel items
        console.log('\n--- First 10 Items in Excel ---');
        excelData.slice(0, 10).forEach(row => {
            console.log(`Excel: "${row.ItemName}" | Stock: ${row['Stock in Hand']}`);

            // Try to find in DB
            const match = row.ItemName ? normalize(row.ItemName) : null;
        });

        // Get DB items and look for mismatches
        const dbItems = await WHItem.find({}).limit(50);
        console.log('\n--- Comparison for first 50 DB items ---');

        let matchCount = 0;
        let mismatchCount = 0;

        for (const item of dbItems) {
            const normName = normalize(item.name);
            const dbQty = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

            // Find in excel
            const excelMatch = excelData.find(row => normalize(row.ItemName || row.name) === normName);

            if (excelMatch) {
                const excelQty = parseFloat(excelMatch['Stock in Hand'] || excelMatch.stock || 0);
                if (dbQty === excelQty) {
                    matchCount++;
                } else {
                    mismatchCount++;
                    console.log(`MISMATCH: "${item.name}"`);
                    console.log(`   DB Qty: ${dbQty} | Excel Qty: ${excelQty}`);
                }
            } else {
                // console.log(`NOT IN EXCEL: "${item.name}"`);
            }
        }

        console.log(`\nVerified 50 items: ${matchCount} MATCHED, ${mismatchCount} MISMATCHED`);

        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

diagnose();
