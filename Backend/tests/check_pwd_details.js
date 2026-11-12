const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const active = await Employee.countDocuments({ branch: '(PWD-1)', isActive: true });
        const inactive = await Employee.countDocuments({ branch: '(PWD-1)', isActive: false });
        const all = await Employee.countDocuments({ branch: '(PWD-1)' });

        console.log('--- PWD-1 AUDIT ---');
        console.log('Active:', active);
        console.log('Inactive:', inactive);
        console.log('Total:', all);

        process.exit(0);
    } catch (err) {
        process.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
