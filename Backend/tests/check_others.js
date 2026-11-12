const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const branches = [
            '(Chandni Chowk)', '(Optician ISB)', '(G15 Markaz)', 
            '(Gujar Khan)', '(Attock)', '(F-6)', '(PWD-1)'
        ];

        const others = await Employee.find({ branch: { $nin: branches } }).lean();
        console.log('--- OTHER BRANCH EMPLOYEES ---');
        console.log('Count:', others.length);
        if (others.length > 0) {
            const otherBranches = [...new Set(others.map(o => o.branch))];
            console.log('Other Branches found:', otherBranches);
            console.log('Sample from others:', JSON.stringify(others.slice(0, 3), null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
