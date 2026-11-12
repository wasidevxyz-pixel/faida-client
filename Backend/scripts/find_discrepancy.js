const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

async function findMissingItems() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        console.log(`Total Rows in Excel: ${excelData.length}`);

        let missingItems = [];
        let totalMissingQty = 0;
        let matchedCount = 0;
        let mismatchDetails = [];

        for (const row of excelData) {
            const name = (row.ItemName || row.name || '').toString().trim();
            const excelStock = parseFloat(row['Stock in Hand'] || row.stock || 0);

            if (!name) continue;

            // Search by name (case insensitive)
            const item = await WHItem.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });

            if (!item) {
                missingItems.push({ name, stock: excelStock });
                totalMissingQty += excelStock;
            } else {
                matchedCount++;
                const dbStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
                if (dbStock !== excelStock) {
                    mismatchDetails.push({ name, excel: excelStock, db: dbStock, diff: excelStock - dbStock });
                }
            }
        }

        console.log('\n--- Missing Items (In Excel but NOT in DB) ---');
        missingItems.forEach((m, i) => {
            console.log(`${i + 1}. "${m.name}" | Stock: ${m.stock}`);
        });

        console.log('\n--- Sync Discrepancies (Matched but Stock Different) ---');
        mismatchDetails.forEach((m, i) => {
            console.log(`${i + 1}. "${m.name}" | Excel: ${m.excel} | DB: ${m.db} | Diff: ${m.diff}`);
        });

        console.log('\n--- Summary ---');
        console.log(`Matched Items: ${matchedCount}`);
        console.log(`Missing Items Count: ${missingItems.length}`);
        console.log(`Total Stock of Missing Items: ${totalMissingQty}`);
        console.log(`Total DB mismatch sum: ${mismatchDetails.reduce((a, b) => a + b.diff, 0)}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

findMissingItems();
