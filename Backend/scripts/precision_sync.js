const mongoose = require('mongoose');
const XLSX = require('xlsx');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const EXCEL_PATH = 'c:\\Users\\user\\Desktop\\WH ITEM STOCK IMPORT.xlsx';

function normalizeName(name) {
    if (!name) return '';
    // Remove extra spaces and convert to lowercase
    return name.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

async function precisionSync() {
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

        console.log(`Processing ${excelData.length} rows from Excel...`);

        let matchedCount = 0;
        let updatedCount = 0;
        let notFound = [];

        // Fetch ALL DB items for faster matching
        const dbItems = await WHItem.find({});
        console.log(`Loaded ${dbItems.length} items from DB.`);

        for (const row of excelData) {
            const excelNameRaw = row.ItemName || row.name;
            const excelStock = parseFloat(row['Stock in Hand'] || row.stock || 0);

            if (!excelNameRaw) continue;

            const normalizedExcelName = normalizeName(excelNameRaw);

            // Find matching item in DB using normalized names
            const item = dbItems.find(i => normalizeName(i.name) === normalizedExcelName);

            if (item) {
                matchedCount++;
                const dbStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

                if (dbStock !== excelStock) {
                    // Update Item
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

                    // Log Change
                    await WHStockLog.create({
                        item: item._id,
                        date: new Date(),
                        type: 'in',
                        qty: excelStock,
                        previousQty: dbStock,
                        newQty: excelStock,
                        refType: 'purchase',
                        refId: item._id,
                        remarks: 'Final Precision Sync (Normalized Names)',
                        createdBy: null
                    });

                    updatedCount++;
                    // console.log(`Fixed: "${item.name}" -> ${excelStock}`);
                }
            } else {
                notFound.push({ name: excelNameRaw, stock: excelStock });
            }
        }

        console.log('\n--- Final Sync Summary ---');
        console.log(`Total Excel Rows: ${excelData.length}`);
        console.log(`Successfully Matched: ${matchedCount}`);
        console.log(`Database Records Updated: ${updatedCount}`);
        console.log(`Items Still Missing: ${notFound.length}`);

        if (notFound.length > 0) {
            console.log('\n--- The following items still do not exist in DB (Please create them manually) ---');
            notFound.forEach(n => console.log(`- "${n.name}" (Qty: ${n.stock})`));
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

precisionSync();
