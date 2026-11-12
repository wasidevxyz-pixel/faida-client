const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const empties = await Employee.countDocuments({ 
            $or: [
                { branch: null },
                { branch: '' },
                { branch: 'null' },
                { branch: 'undefined' }
            ]
        });

        console.log('--- EMPTY BRANCH AUDIT ---');
        console.log('Empty Branch count:', empties);

        process.exit(0);
    } catch (err) {
        process.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
