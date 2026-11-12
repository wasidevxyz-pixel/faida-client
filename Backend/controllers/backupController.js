const asyncHandler = require('../middleware/async');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import all models
const Account = require('../models/Account');
const AccountCategory = require('../models/AccountCategory');
const AccountGroup = require('../models/AccountGroup');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const Bank = require('../models/Bank');
const BankTransaction = require('../models/BankTransaction');
const BankTransfer = require('../models/BankTransfer');
const CashSale = require('../models/CashSale');
const CashTransaction = require('../models/CashTransaction');
const Category = require('../models/Category');
const ClosingSheet = require('../models/ClosingSheet');
const Company = require('../models/Company');
const CustomerDemand = require('../models/CustomerDemand');
const CustomerPayment = require('../models/CustomerPayment');
const DailyCash = require('../models/DailyCash');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const EmployeeAdjustment = require('../models/EmployeeAdjustment');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeClearance = require('../models/EmployeeClearance');
const EmployeeCommission = require('../models/EmployeeCommission');
const EmployeePenalty = require('../models/EmployeePenalty');
const Expense = require('../models/Expense');
const ExpenseHead = require('../models/ExpenseHead');
const Group = require('../models/Group');
const HolyDay = require('../models/HolyDay');
const Item = require('../models/Item');
const ItemClass = require('../models/ItemClass');
const Ledger = require('../models/Ledger');
const LedgerEntry = require('../models/LedgerEntry');
const MonthlyBalance = require('../models/MonthlyBalance');
const Party = require('../models/Party');
const Payment = require('../models/Payment');
const Payroll = require('../models/Payroll');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const PurchaseReturn = require('../models/PurchaseReturn');
const Receipt = require('../models/Receipt');
const ReferenceImage = require('../models/ReferenceImage');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const Settings = require('../models/Settings');
const StockAdjustment = require('../models/StockAdjustment');
const StockAudit = require('../models/StockAudit');
const StockLog = require('../models/StockLog');
const Store = require('../models/Store');
const SubClass = require('../models/SubClass');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const SupplierTax = require('../models/SupplierTax');
const SupplierTaxCPR = require('../models/SupplierTaxCPR');
const Tax = require('../models/Tax');
const Transaction = require('../models/Transaction');
const Unit = require('../models/Unit');
const User = require('../models/User');
const Voucher = require('../models/Voucher');

// Models Map
const models = {
    Account, AccountCategory, AccountGroup, Attendance, AuditLog, Bank, BankTransaction, BankTransfer,
    CashSale, CashTransaction, Category, ClosingSheet, Company, CustomerDemand, CustomerPayment,
    DailyCash, Department, Employee, EmployeeAdjustment, EmployeeAdvance, EmployeeClearance,
    EmployeeCommission, EmployeePenalty, Expense, ExpenseHead, Group, HolyDay, Item, ItemClass,
    Ledger, LedgerEntry, MonthlyBalance, Party, Payment, Payroll, Purchase, PurchaseItem,
    PurchaseReturn, Receipt, ReferenceImage, Sale, SaleItem, SalesReturn, Settings,
    StockAdjustment, StockAudit, StockLog, Store, SubClass, Supplier, SupplierPayment,
    SupplierTax, SupplierTaxCPR, Tax, Transaction, Unit, User, Voucher
};

// @desc    Export massive backup of all data
// @route   GET /api/v1/backup/export
// @access  Private (Admin)
exports.exportBackup = asyncHandler(async (req, res) => {
    console.log('Starting Full System Backup...');
    const backupData = {
        timestamp: new Date(),
        version: '2.0',
        metadata: {
            exportedBy: req.user?.name || req.user?.email || 'Unknown',
            totalModels: Object.keys(models).length
        },
        data: {}
    };

    try {
        for (const [name, Model] of Object.entries(models)) {
            try {
                if (!Model || typeof Model.find !== 'function') {
                    console.warn(`Skipping ${name}: Invalid Model or missing find method.`);
                    continue;
                }
                const docs = await Model.find({}).lean(); // Use lean() for performance
                backupData.data[name] = docs;
                // console.log(`Exported ${docs.length} documents from ${name}`);
            } catch (innerError) {
                console.error(`Error exporting model ${name}:`, innerError.message);
                // Continue with other models instead of failing completely
                backupData.data[name] = [];
            }
        }

        res.status(200).json({
            success: true,
            data: backupData,
            message: 'System backup created (check server logs for any partial failures)'
        });
    } catch (error) {
        console.error('Backup Export Fatal Error:', error);
        res.status(500).json({ success: false, message: 'Backup failed: ' + error.message });
    }
});

// @desc    Import/Restore massive backup
// @route   POST /api/v1/backup/import
// @access  Private (Admin)
exports.importBackup = asyncHandler(async (req, res) => {
    console.log('Starting Full System Restore...');

    // Check if file is uploaded
    if (!req.files || !req.files.backup) {
        // Fallback to checking body if sent as JSON payload (less likely for huge files)
        if (req.body && req.body.data) {
            return processRestore(req.body, res);
        }
        return res.status(400).json({ success: false, message: 'No backup file uploaded' });
    }

    const file = req.files.backup;

    try {
        // Parse JSON file
        const fileContent = file.data.toString('utf8');
        const backupData = JSON.parse(fileContent);

        await processRestore(backupData, res);

    } catch (error) {
        console.error('Restore Error:', error);
        res.status(500).json({ success: false, message: 'Restore failed: ' + error.message });
    }
});

async function processRestore(backupData, res) {
    if (!backupData.data) {
        throw new Error('Invalid backup format: missing data field');
    }

    const report = {
        restoredModels: [],
        errors: []
    };

    // Sequential Restore to avoid overwhelming DB
    for (const [modelName, docs] of Object.entries(backupData.data)) {
        if (models[modelName]) {
            try {
                // 1. Clear existing collection
                await models[modelName].deleteMany({});

                // 2. Insert new data
                if (docs && docs.length > 0) {
                    await models[modelName].insertMany(docs);
                }

                console.log(`Restored ${docs.length} documents for ${modelName}`);
                report.restoredModels.push({ model: modelName, count: docs.length });
            } catch (err) {
                console.error(`Error restoring ${modelName}:`, err);
                report.errors.push({ model: modelName, error: err.message });
            }
        } else {
            console.warn(`Unknown model in backup: ${modelName}`);
        }
    }

    res.status(200).json({
        success: true,
        message: 'System restore completed',
        report
    });
}
