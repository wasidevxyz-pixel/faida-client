const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load env if exists
dotenv.config({ path: path.join(__dirname, 'Backend/.env') });

const Payroll = require('../Backend/models/Payroll');

async function checkData() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/bas-software';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const p = await Payroll.findOne({ bankPaid: { $gt: 0 } }).sort('-createdAt').lean();
        if (p) {
            console.log('Found Bank Paid Payroll:');
            console.log(JSON.stringify(p, null, 2));
        } else {
            console.log('No bank paid payroll found.');
        }

        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkData();
