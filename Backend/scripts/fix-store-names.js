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

async function fixStoreNames() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected!');

        const oldName = "DW-BR-ATTOCK-(COS)";
        const newName = "D-WATSON (PWD)";

        // Also check for potential variations if any
        // const oldNameRegex = /ATTOCK/i; 

        console.log(`Checking for records with branch: "${oldName}"`);

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
            try {
                const count = await model.countDocuments({ branch: oldName });
                if (count > 0) {
                    console.log(`Found ${count} ${name} records with old name. Updating...`);
                    const result = await model.updateMany(
                        { branch: oldName },
                        { $set: { branch: newName } }
                    );
                    console.log(`✅ Updated ${result.modifiedCount} documents in ${name}`);
                } else {
                    console.log(`ℹ️  No ${name} records found with old name "${oldName}"`);
                }
            } catch (err) {
                console.error(`❌ Error updating ${name}: ${err.message}`);
            }
        }

        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

fixStoreNames();
