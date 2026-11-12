require('dotenv').config();
const mongoose = require('mongoose');

const models = [
    'Bank', 'Department', 'ClosingSheet', 'DailyCash', 'CashSale', 'Voucher'
];

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected.');

        for (const modelName of models) {
            const Model = require(`../models/${modelName}`);
            // Aggregate check
            const results = await Model.aggregate([
                { $group: { _id: "$branch", count: { $sum: 1 } } }
            ]);
            console.log(`\n--- ${modelName} ---`);
            results.forEach(r => console.log(`  "${r._id}": ${r.count}`));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
