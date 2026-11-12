const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const imports = await Employee.countDocuments({ payrollImportOnly: true });
        const pwds_import = await Employee.countDocuments({ branch: /PWD/i, payrollImportOnly: true });
        const pwds_total = await Employee.countDocuments({ branch: /PWD/i });

        console.log('--- EMPLOYEE AUDIT ---');
        console.log('Import Only Total:', imports);
        console.log('PWD Total (including imports):', pwds_total);
        console.log('PWD Import Only:', pwds_import);

        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
