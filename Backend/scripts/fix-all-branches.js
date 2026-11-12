require('dotenv').config();
const mongoose = require('mongoose');

// Import all models
const Bank = require('../models/Bank');
const Department = require('../models/Department');
const Voucher = require('../models/Voucher');
const SupplierPayment = require('../models/SupplierPayment');
const Payroll = require('../models/Payroll');
const Expense = require('../models/Expense');
const EmployeePenalty = require('../models/EmployeePenalty');
const EmployeeCommission = require('../models/EmployeeCommission');
const EmployeeClearance = require('../models/EmployeeClearance');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdjustment = require('../models/EmployeeAdjustment');
const Employee = require('../models/Employee');
const DailyCash = require('../models/DailyCash');
const CustomerPayment = require('../models/CustomerPayment');
const CustomerDemand = require('../models/CustomerDemand');
const ClosingSheet = require('../models/ClosingSheet');
const Attendance = require('../models/Attendance');
const Account = require('../models/Account');
const CashSale = require('../models/CashSale');

async function fixAllBranches() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected!');

        const targetName = "D-WATSON (PWD)";

        const models = [
            { model: Bank, name: 'Bank' },
            { model: Department, name: 'Department' },
            { model: Voucher, name: 'Voucher' },
            { model: SupplierPayment, name: 'SupplierPayment' },
            { model: Payroll, name: 'Payroll' },
            { model: Expense, name: 'Expense' },
            { model: EmployeePenalty, name: 'EmployeePenalty' },
            { model: EmployeeCommission, name: 'EmployeeCommission' },
            { model: EmployeeClearance, name: 'EmployeeClearance' },
            { model: EmployeeAdvance, name: 'EmployeeAdvance' },
            { model: EmployeeAdjustment, name: 'EmployeeAdjustment' },
            { model: Employee, name: 'Employee' },
            { model: DailyCash, name: 'DailyCash' },
            { model: CustomerPayment, name: 'CustomerPayment' },
            { model: CustomerDemand, name: 'CustomerDemand' },
            { model: ClosingSheet, name: 'ClosingSheet' },
            { model: Attendance, name: 'Attendance' },
            { model: Account, name: 'Account' },
            { model: CashSale, name: 'CashSale' }
        ];

        for (const { model, name } of models) {
            console.log(`\nChecking ${name}...`);
            // Find docs where branch is NOT the target
            const docs = await model.find({ branch: { $ne: targetName } });

            if (docs.length > 0) {
                console.log(`Found ${docs.length} records in ${name} with mismatched branch names.`);
                for (const doc of docs) {
                    console.log(`  Updating ID ${doc._id}: "${doc.branch}" -> "${targetName}"`);
                    if (doc.branch) { // Only update if it HAS a branch field
                        doc.branch = targetName;
                        await doc.save();
                    }
                }
                console.log(`✅ Fixed ${docs.length} records.`);
            } else {
                console.log(`All clean.`);
            }
        }

        console.log('\nGlobal fix completed.');
        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

fixAllBranches();
