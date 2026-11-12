const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const last = await Employee.find({}).sort({ code: -1 }).limit(10).lean();
        console.log('--- RECENT EMPLOYEES ---');
        console.log(JSON.stringify(last, null, 2));

        const branches = await Employee.find({}).distinct('branch');
        console.log('Branches:', branches);

        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
