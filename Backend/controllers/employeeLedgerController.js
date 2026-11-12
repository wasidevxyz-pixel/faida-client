const mongoose = require('mongoose');
const EmployeeLedger = require('../models/EmployeeLedger');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdjustment = require('../models/EmployeeAdjustment');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');

// @desc    Get Ledger for Employee
// @route   GET /api/v1/employee-ledger/:employeeId
exports.getEmployeeLedger = async (req, res) => {
    try {
        const ledger = await EmployeeLedger.find({ employee: req.params.employeeId })
            .sort({ date: 1, createdAt: 1 });

        res.status(200).json({ success: true, data: ledger });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Current Balance
// @route   GET /api/v1/employee-ledger/balance/:employeeId
exports.getCurrentBalance = async (req, res) => {
    try {
        const ledger = await EmployeeLedger.find({ employee: req.params.employeeId })
            .sort({ date: 1, createdAt: 1 });

        let balance = 0;
        if (ledger.length > 0) {
            balance = ledger[ledger.length - 1].balance;
        } else {
            // Fallback: Check opening balance if no transactions
            const emp = await Employee.findById(req.params.employeeId);
            if (emp) balance = emp.opening || 0;
        }

        res.status(200).json({ success: true, balance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Helper to Rebuild Ledger Internally
exports.recalculateEmployeeLedger = async (employeeId) => {
    // 1. Clear existing ledger
    await EmployeeLedger.deleteMany({ employee: employeeId });
    const emp = await Employee.findById(employeeId);
    if (!emp) return;

    let entries = [];
    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    // 2. Opening Balance
    if (emp.opening && emp.opening !== 0) {
        entries.push({
            date: new Date('2000-01-01'),
            type: 'Advance',
            description: 'Opening Balance',
            debit: emp.opening,
            credit: 0,
            referenceModel: 'Opening',
            referenceId: null,
            branch: emp.branch || '',
            createdAt: new Date('2000-01-01T00:00:00Z'),
            sortPriority: 0
        });
    }

    // 3. Advances
    const advances = await EmployeeAdvance.find({ employee: empObjectId }).lean();
    
    // Fetch existence of linked payrolls in bulk to avoid N+1 queries in the loop
    const payrollIds = [...new Set(advances.filter(adv => adv.payroll).map(adv => adv.payroll.toString()))];
    let existingPayrollIds = new Set();
    if (payrollIds.length > 0) {
        const existingPayrolls = await Payroll.find({ _id: { $in: payrollIds } }).select('_id').lean();
        existingPayrollIds = new Set(existingPayrolls.map(p => p._id.toString()));
    }

    const orphanAdvanceIds = [];
    for (const adv of advances) {
        if (!adv.paid || adv.paid === 0) continue;

        // ORPHAN CHECK: If linked to a payroll that doesn't exist, SKIP IT
        if (adv.payroll) {
            const payrollExists = existingPayrollIds.has(adv.payroll.toString());
            if (!payrollExists) {
                orphanAdvanceIds.push(adv._id);
                continue;
            }
        }

        let advDate = new Date(adv.date);
        // If it's a payroll recovery, force it to the end of that month
        if (adv.payroll) {
            advDate = new Date(advDate.getFullYear(), advDate.getMonth() + 1, 0);
        }

        entries.push({
            date: advDate,
            type: adv.transactionType === 'Pay' ? 'Advance' : 'Return',
            description: adv.remarks || (adv.transactionType === 'Pay' ? 'Advance Transaction' : 'Return Transaction'),
            debit: adv.transactionType === 'Pay' ? (adv.paid || 0) : 0,
            credit: adv.transactionType === 'Received' ? (adv.paid || 0) : 0,
            referenceModel: 'EmployeeAdvance',
            referenceId: adv._id,
            branch: adv.branch,
            createdAt: adv.createdAt,
            sortPriority: adv.transactionType === 'Pay' ? 1 : 2
        });
    }

    if (orphanAdvanceIds.length > 0) {
        await EmployeeAdvance.deleteMany({ _id: { $in: orphanAdvanceIds } });
    }

    // 4. Adjustments
    const adjustments = await EmployeeAdjustment.find({ employee: empObjectId });
    adjustments.forEach(adj => {
        if (!adj.amount || adj.amount === 0) return;

        // Prevent Double Counting
        const isMirrored = advances.some(adv => {
            const dateMatch = new Date(adv.date).toDateString() === new Date(adj.date).toDateString();
            const typeMatch = (adj.type === 'Pay' && adv.transactionType === 'Pay') ||
                (adj.type === 'Received' && adv.transactionType === 'Received');
            const amtMatch = adv.paid === adj.amount;
            const remarkMatch = adv.remarks && adv.remarks.includes('Adjustment');

            return dateMatch && typeMatch && amtMatch && remarkMatch;
        });

        if (isMirrored) return;

        const isPay = adj.type === 'Pay';
        const isRec = adj.type === 'Received';
        entries.push({
            date: new Date(adj.date),
            type: 'Adjustment',
            description: adj.remarks || 'Adjustment',
            debit: isPay ? (adj.amount || 0) : 0,
            credit: isRec ? (adj.amount || 0) : 0,
            referenceModel: 'EmployeeAdjustment',
            referenceId: adj._id,
            branch: adj.branch,
            createdAt: adj.createdAt,
            sortPriority: isPay ? 1 : 2
        });
    });

    // 5. Payroll Entries (Informational - In/Out)
    const payrolls = await Payroll.find({ employee: empObjectId, isImportOnly: { $ne: true } });
    for (const p of payrolls) {
        const amt = parseFloat((p.cashPaid || 0) + (p.bankPaid || 0));
        if (amt > 0) {
            // Calculate last day of the month from monthYear ("YYYY-MM")
            const [year, month] = p.monthYear.split('-').map(Number);
            const pDate = new Date(year, month, 0);

            entries.push({
                date: pDate,
                type: 'Payroll',
                description: `Salary Paid (In/Out) - ${p.monthYear}`,
                debit: amt,
                credit: amt,
                referenceModel: 'Payroll',
                referenceId: p._id,
                branch: p.branch,
                createdAt: p.createdAt || new Date(),
                sortPriority: 2
            });
        }
    }

    // Sort
    entries.sort((a, b) => {
        const d1 = new Date(a.date);
        const d2 = new Date(b.date);

        // 1. Sort by Year
        if (d1.getFullYear() !== d2.getFullYear()) {
            return d1.getFullYear() - d2.getFullYear();
        }

        // 2. Sort by Month
        if (d1.getMonth() !== d2.getMonth()) {
            return d1.getMonth() - d2.getMonth();
        }

        // 3. Same Month? Sort by Priority (Debits 1 < Credits 2)
        if (a.sortPriority !== b.sortPriority) {
            return a.sortPriority - b.sortPriority;
        }

        // 4. Same Priority? Sort by Day
        if (d1.getDate() !== d2.getDate()) {
            return d1.getDate() - d2.getDate();
        }

        // 5. Fallback to createdAt
        return (new Date(a.createdAt) - new Date(b.createdAt));
    });

    let runningBalance = 0;
    const ledgerDocs = entries.map(entry => {
        runningBalance += (entry.debit - entry.credit);
        return {
            employee: employeeId,
            date: entry.date,
            type: entry.type,
            description: entry.description,
            debit: entry.debit,
            credit: entry.credit,
            balance: runningBalance,
            referenceModel: entry.referenceModel,
            referenceId: entry.referenceId,
            branch: entry.branch
        };
    });

    if (ledgerDocs.length > 0) {
        await EmployeeLedger.insertMany(ledgerDocs);
    }
};

// @desc    Get Current Balances for All Employees
// @route   GET /api/v1/employee-ledger/all-balances
exports.getAllEmployeeBalances = async (req, res) => {
    try {
        const { branch, department, balanceType } = req.query;

        // 1. Build Employee Filter
        let empQuery = { isActive: true };
        if (branch && branch !== 'All Branches') empQuery.branch = branch;
        
        // Apply branch level restriction (Mir Aziz fix)
        const { applyBranchFilter } = require('../middleware/auth');
        empQuery = await applyBranchFilter(req, empQuery, Employee);
        
        if (department && department !== 'All Departments') empQuery.department = department;

        const employees = await Employee.find(empQuery).populate('department');

        // 2. Fetch Latest Ledger entries for all matching employees
        const empIds = employees.map(e => e._id);

        // Aggregate to find the latest ledger entry for each employee
        const latestEntries = await EmployeeLedger.aggregate([
            { $match: { employee: { $in: empIds } } },
            { $sort: { date: 1, createdAt: 1 } },
            {
                $group: {
                    _id: '$employee',
                    balance: { $last: '$balance' },
                    lastDate: { $last: '$date' }
                }
            }
        ]);

        const entryMap = {};
        latestEntries.forEach(e => entryMap[e._id.toString()] = e);

        // 3. Construct Results
        let results = employees.map(emp => {
            const entry = entryMap[emp._id.toString()];
            const balance = entry ? entry.balance : (emp.opening || 0);

            return {
                _id: emp._id,
                code: emp.code,
                name: emp.name,
                branch: emp.branch,
                department: emp.department ? emp.department.name : 'N/A',
                balance: balance,
                lastActivity: entry ? entry.lastDate : null
            };
        });

        // 4. Apply Balance Filters
        if (balanceType === 'Zero Balance') {
            results = results.filter(r => r.balance === 0);
        } else if (balanceType === 'Greater than Zero') {
            results = results.filter(r => r.balance > 0);
        }

        res.status(200).json({ success: true, count: results.length, data: results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Rebuild Ledger for an Employee (or all)
// @route   POST /api/v1/employee-ledger/rebuild
exports.rebuildLedger = async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (employeeId) {
            await exports.recalculateEmployeeLedger(employeeId);
            return res.status(200).json({ success: true, message: `Ledger rebuilt for employee` });
        }

        const employees = await Employee.find({});
        for (const emp of employees) {
            await exports.recalculateEmployeeLedger(emp._id);
        }

        res.status(200).json({ success: true, message: `Ledger rebuilt for all employees` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};
