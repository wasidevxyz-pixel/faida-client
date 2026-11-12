require('dotenv').config();
const mongoose = require('mongoose');
const ClosingSheet = require('../models/ClosingSheet');

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected.');

        const branches = await ClosingSheet.distinct('branch');
        console.log('Distinct Branches in ClosingSheet:', branches);

        const allSheets = await ClosingSheet.find({}, 'date branch').limit(20);
        console.log('Sample Sheets:', allSheets);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
