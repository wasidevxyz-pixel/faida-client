const Store = require('../models/Store');

// Helper: Check if user has a specific group right (works with Mongoose Map or plain object)
const hasGroupRight = (user, ...keys) => {
    if (!user || !user.groupId || !user.groupId.rights) return false;
    const rights = user.groupId.rights;
    for (const key of keys) {
        const val = (rights instanceof Map) ? rights.get(key) : rights[key];
        if (val === true) return true;
    }
    return false;
};

// @desc    Get all stores
// @route   GET /api/v1/stores
exports.getStores = async (req, res) => {
    try {
        let query = {};

        // 1. ADAPTIVE ROLE CHECK: Support role field AND group rights
        //    Matches the same logic as applyBranchFilter in auth.js
        const userRole = (req.user && req.user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin'
            || hasGroupRight(req.user, 'admin', 'administration');

        // 2. APPLY FILTER ONLY FOR RESTRICTED USERS
        //    If user is admin (by role OR group right), skip branch filtering entirely.
        //    If user has specific branches assigned, restrict to those branches only.
        //    If user has NO branches assigned AND is not admin, show nothing (empty result).
        const canIgnorePermissions = req.query.ignorePermissions === 'true';
        if (req.user && !canIgnorePermissions) {
            const assignedBranches = Array.isArray(req.user.branch)
                ? req.user.branch.map(b => String(b).trim()).filter(Boolean)
                : (req.user.branch ? [String(req.user.branch).trim()].filter(Boolean) : []);

            const assignedBranchIds = [];
            const assignedBranchNames = [];
            for (const branchValue of assignedBranches) {
                if (/^[0-9a-fA-F]{24}$/.test(branchValue)) {
                    assignedBranchIds.push(branchValue);
                } else {
                    assignedBranchNames.push(branchValue);
                }
            }

            // If user has explicit branch assignments, always restrict to them.
            // This applies even to admin-role users to honor branch-level assignment.
            if (assignedBranches.length > 0) {
                query.$or = [];
                if (assignedBranchNames.length > 0) {
                    query.$or.push({ name: { $in: assignedBranchNames } });
                }
                if (assignedBranchIds.length > 0) {
                    query.$or.push({ _id: { $in: assignedBranchIds } });
                }
            } else if (!isAdmin) {
                // Non-admin with no assigned branches should see no stores.
                query._id = { $in: [] };
            }
        }

        const stores = await Store.find(query).sort({ name: 1 });
        res.status(200).json({ success: true, data: stores });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single store
// @route   GET /api/v1/stores/:id
exports.getStore = async (req, res) => {
    try {
        const store = await Store.findById(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: store });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create store
// @route   POST /api/v1/stores
exports.createStore = async (req, res) => {
    try {
        const store = await Store.create(req.body);
        res.status(201).json({ success: true, data: store });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const Department = require('../models/Department');
const CashSale = require('../models/CashSale');
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
const Bank = require('../models/Bank');
const Attendance = require('../models/Attendance');
const Account = require('../models/Account');

// @desc    Update store
// @route   PUT /api/v1/stores/:id
exports.updateStore = async (req, res) => {
    try {
        let store = await Store.findById(req.params.id);

        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }

        // Check if name is changing
        if (req.body.name && req.body.name !== store.name) {
            const oldName = store.name;
            const newName = req.body.name;

            // Cascade update to Departments
            await Department.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to CashSales
            await CashSale.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Vouchers
            await Voucher.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to SupplierPayments
            await SupplierPayment.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Payrolls
            await Payroll.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Expenses
            await Expense.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to EmployeePenalties
            await EmployeePenalty.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to EmployeeCommissions
            await EmployeeCommission.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to EmployeeClearances
            await EmployeeClearance.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to EmployeeAdvances
            await EmployeeAdvance.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to EmployeeAdjustments
            await EmployeeAdjustment.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Employees
            await Employee.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to DailyCash
            await DailyCash.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to CustomerPayments
            await CustomerPayment.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to CustomerDemands
            await CustomerDemand.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to ClosingSheets
            await ClosingSheet.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Banks
            await Bank.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Attendances
            await Attendance.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // Cascade update to Accounts
            await Account.updateMany(
                { branch: oldName },
                { $set: { branch: newName } }
            );

            // You might want to update other collections like Purchases, Stock, etc. if they store branch name string.
        }

        store = await Store.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({ success: true, data: store });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete store
// @route   DELETE /api/v1/stores/:id
exports.deleteStore = async (req, res) => {
    try {
        const store = await Store.findByIdAndDelete(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
