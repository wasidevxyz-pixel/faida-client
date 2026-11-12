/**
 * Create MongoDB Indexes for HR Dashboard Performance
 * Run once: node scripts/create-indexes.js
 * Or add to your database initialization
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const EmployeeCommission = require('../models/EmployeeCommission');

const createIndexes = async () => {
    try {
        console.log('🔍 Creating HR Dashboard Performance Indexes...\n');

        // Employee indexes
        console.log('📝 Creating Employee indexes...');
        await Employee.collection.createIndex({ branch: 1, isActive: 1 });
        await Employee.collection.createIndex({ code: 1 }, { unique: true });
        await Employee.collection.createIndex({ branch: 1, department: 1, designation: 1 });
        await Employee.collection.createIndex({ name: 1 });
        await Employee.collection.createIndex({ branch: 1, code: 1, isActive: 1 });
        await Employee.collection.createIndex({ isActive: 1, code: 1 });
        console.log('✅ Employee indexes created\n');

        // Attendance indexes
        console.log('📝 Creating Attendance indexes...');
        await Attendance.collection.createIndex({ employee: 1, date: 1 });
        await Attendance.collection.createIndex({ date: 1, branch: 1 });
        await Attendance.collection.createIndex({ employee: 1, date: 1, displayStatus: 1 });
        await Attendance.collection.createIndex({ branch: 1, date: 1 });
        console.log('✅ Attendance indexes created\n');

        // Payroll indexes
        console.log('📝 Creating Payroll indexes...');
        await Payroll.collection.createIndex({ employee: 1, monthYear: 1 });
        await Payroll.collection.createIndex({ branch: 1, monthYear: 1 });
        await Payroll.collection.createIndex({ monthYear: 1 });
        await Payroll.collection.createIndex({ branch: 1, code: 1 });
        console.log('✅ Payroll indexes created\n');

        // Employee Advance indexes
        console.log('📝 Creating Employee Advance indexes...');
        await EmployeeAdvance.collection.createIndex({ employee: 1, status: 1 });
        await EmployeeAdvance.collection.createIndex({ branch: 1, status: 1 });
        console.log('✅ Employee Advance indexes created\n');

        // Department & Designation indexes
        console.log('📝 Creating Department & Designation indexes...');
        await EmployeeDepartment.collection.createIndex({ name: 1 });
        await Designation.collection.createIndex({ name: 1 });
        console.log('✅ Department & Designation indexes created\n');

        // Employee Commission indexes
        console.log('📝 Creating Employee Commission indexes...');
        await EmployeeCommission.collection.createIndex({ monthYear: 1, "data.id": 1 });
        console.log('✅ Employee Commission indexes created\n');

        console.log('✨ All indexes created successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating indexes:', error.message);
        process.exit(1);
    }
};

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory').then(() => {
    console.log('✅ Connected to MongoDB\n');
    createIndexes();
}).catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
});
