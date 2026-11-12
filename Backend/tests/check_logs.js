const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        // Check Audit Logs for any employee deletions in the last 48 hours
        const deletions = await AuditLog.find({ 
            model: 'Employee', 
            action: 'delete',
            createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 }).lean();

        console.log('--- DELETION AUDIT ---');
        console.log('Employee Deletions in last 48h:', deletions.length);
        if (deletions.length > 0) {
            console.log('Sample Deletions:', JSON.stringify(deletions, null, 2));
        }

        // Also check if any were made inactive
        const statusChanges = await AuditLog.find({
            model: 'Employee',
            action: 'update',
            'changes.isActive': { $exists: true },
            createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 }).lean();
        
        console.log('Status changes in last 48h:', statusChanges.length);

        process.exit(0);
    } catch (err) {
        process.error('Audit failed:', err);
        process.exit(1);
    }
}

check();
