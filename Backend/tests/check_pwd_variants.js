const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        // Search for partial matches of PWD and 1 in branch name
        const matchAll = await Employee.find({ 
            $or: [
                { branch: /PWD/i },
                { branch: /1/ }
            ]
        }).countDocuments();

        const matchBranches = await Employee.aggregate([
            { $group: { _id: '$branch', count: { $sum: 1 } } }
        ]);

        console.log('--- BRANCH AUDIT ---');
        console.log('Any branch matching PWD or 1:', matchAll);
        console.log('All Branches:', JSON.stringify(matchBranches, null, 2));

        process.exit(0);
    } catch (err) {
        process.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
