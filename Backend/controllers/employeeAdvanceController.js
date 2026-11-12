const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdvanceInstallmentPlan = require('../models/EmployeeAdvanceInstallmentPlan');
const Payroll = require('../models/Payroll');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

const getMonthYear = (dateValue) => {
    const date = dateValue ? new Date(dateValue) : new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// @desc    Get Advance Pay & Received Report
// @route   GET /api/v1/employee-advances/report
exports.getAdvancePayRecReport = async (req, res) => {
    try {
        const { startDate, endDate, branch, department, reportType, employee, isSummary } = req.query;

        let results = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // 1. Get base employee list based on filters
        let empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
        if (employee) empQuery._id = employee;
        if (branch && branch !== 'All Branches') empQuery.branch = branch;
        
        // Apply branch level restriction (Mir Aziz fix)
        const { applyBranchFilter } = require('../middleware/auth');
        empQuery = await applyBranchFilter(req, empQuery, Employee);

        if (department && department !== 'All Departments') {
            empQuery.department = new mongoose.Types.ObjectId(department);
        }

        const employees = await Employee.find(empQuery).populate('department');
        const empIds = employees.map(e => e._id);

        // 2. Calculate Opening Balances (Opening + Transactions before startDate)
        if (reportType === 'Opening Balance Only' || reportType === 'Total Advance') {
            for (const emp of employees) {
                // Initial opening from profile
                let balance = parseFloat(emp.opening || 0);

                // Add transactions before the requested startDate
                const previousAdvances = await EmployeeAdvance.find({
                    employee: emp._id,
                    date: { $lt: start }
                });

                previousAdvances.forEach(adv => {
                    if (adv.transactionType === 'Pay') balance += parseFloat(adv.paid || 0);
                    else balance -= parseFloat(adv.paid || 0);
                });

                if (balance !== 0) {
                    results.push({
                        employeeId: emp._id.toString(),
                        date: start,
                        code: emp.code,
                        name: emp.name,
                        branch: emp.branch,
                        department: emp.department ? emp.department.name : 'N/A',
                        type: 'Opening',
                        description: 'Balance B/F',
                        amount: balance,
                        transactionType: balance >= 0 ? 'Pay' : 'Received'
                    });
                }
            }
        }

        // 3. Handle Advance Transactions within the range (Do NOT filter by branch here to ensure correct balances)
        if (reportType !== 'Opening Balance Only') {
            let advQuery = {
                employee: { $in: empIds },
                date: { $gte: start, $lte: end }
            };

            if (reportType === 'Advance Pay Only') advQuery.transactionType = 'Pay';
            else if (reportType === 'Advance Received Only') advQuery.transactionType = 'Received';

            const advances = await EmployeeAdvance.find(advQuery)
                .populate({
                    path: 'employee',
                    populate: { path: 'department' }
                });

            advances.forEach(adv => {
                if (!adv.employee) return;
                results.push({
                    employeeId: adv.employee._id.toString(),
                    date: adv.date,
                    code: adv.employee.code,
                    name: adv.employee.name,
                    branch: adv.employee.branch,
                    department: adv.employee.department ? adv.employee.department.name : 'N/A',
                    type: adv.transactionType === 'Pay' ? 'Advance' : 'Recovery',
                    description: adv.remarks || (adv.transactionType === 'Pay' ? 'Advance Paid' : 'Advance Recovery'),
                    amount: parseFloat(adv.paid || 0),
                    transactionType: adv.transactionType
                });
            });
        }

        // 4. Summarize if requested
        if (isSummary === 'true') {
            const summaryMap = {};
            results.forEach(row => {
                const key = row.employeeId;
                if (!summaryMap[key]) {
                    summaryMap[key] = {
                        ...row,
                        description: 'Summary Total',
                        type: 'Total',
                        amount: 0
                    };
                }
                if (row.transactionType === 'Pay' || row.type === 'Opening') summaryMap[key].amount += row.amount;
                else summaryMap[key].amount -= row.amount;
            });
            results = Object.values(summaryMap).filter(r => r.amount !== 0);
        }

        // 5. Filter out zero amounts and sort
        results = results.filter(row => row.amount !== 0);
        results.sort((a, b) => new Date(a.date) - new Date(b.date));
        res.status(200).json({ success: true, count: results.length, data: results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all employee advances
// @route   GET /api/v1/employee-advances
exports.getEmployeeAdvances = async (req, res) => {
    try {
        let query = {};
        if (req.query.employee && req.query.employee !== 'undefined' && mongoose.Types.ObjectId.isValid(req.query.employee)) {
            query.employee = req.query.employee;
        } else {
            // Hide 'Import Only' employees by default
            const hiddenEmps = await Employee.find({
                $or: [{ payrollImportOnly: true }, { code: /^IMP-/i }]
            }).select('_id').lean();
            if (hiddenEmps.length > 0) {
                query.employee = { $nin: hiddenEmps.map(e => e._id) };
            }
        }
        if (req.query.startDate && req.query.endDate) {
            query.date = { $gte: new Date(req.query.startDate), $lte: new Date(req.query.endDate) };
        }

        // If searching by employee, ignore branch filters to ensure correct history/balance
        if (req.query.employee && req.query.employee !== 'undefined' && mongoose.Types.ObjectId.isValid(req.query.employee)) {
            query.employee = req.query.employee;
            // Explicitly REMOVE any branch filter set above so we see their full history across branches
            delete query.branch;
        } else {
            // Apply normal branch filtering for list views
            if (req.query.branch) query.branch = req.query.branch;

            const { applyBranchFilter } = require('../middleware/auth');
            query = await applyBranchFilter(req, query, EmployeeAdvance);
        }

        // ─── PHASE 1: Hard Pagination ───────────────────────────
        const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        const [advances, totalCount] = await Promise.all([
            EmployeeAdvance.find(query)
                .select('employee department date branch transactionType amount paid balance remarks preMonthBal currentMonthBal total salary createdAt preMonthInstallment currentMonthInstallment payroll')
                .populate('employee', 'name code branch opening department')
                .populate('department', 'name')
                .populate('createdBy', 'name')
                .sort({ date: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EmployeeAdvance.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: advances.length,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            data: advances
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get separated employee advance installment plan
// @route   GET /api/v1/employee-advances/installment-plan
exports.getInstallmentPlan = async (req, res) => {
    try {
        const { employee, date } = req.query;
        if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
            return res.status(400).json({ success: false, message: 'Valid employee is required' });
        }

        const selectedDate = date ? new Date(date) : new Date();
        const selectedMonthYear = getMonthYear(selectedDate);

        const latestPrePlan = await EmployeeAdvanceInstallmentPlan.findOne({
            employee,
            monthYear: { $lte: selectedMonthYear },
            'preMonthInstallment.installment': { $gte: 0 }
        }).sort({ monthYear: -1, updatedAt: -1 }).lean();

        const currentMonthPlan = await EmployeeAdvanceInstallmentPlan.findOne({
            employee,
            monthYear: selectedMonthYear,
            'currentMonthInstallment.installment': { $gte: 0 }
        }).sort({ updatedAt: -1 }).lean();

        res.status(200).json({
            success: true,
            data: {
                preMonthInstallment: latestPrePlan?.preMonthInstallment || null,
                currentMonthInstallment: currentMonthPlan?.currentMonthInstallment || null,
                preMonthPlanMonth: latestPrePlan?.monthYear || null,
                currentMonthPlanMonth: currentMonthPlan?.monthYear || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Save separated employee advance installment plan
// @route   POST /api/v1/employee-advances/installment-plan
exports.saveInstallmentPlan = async (req, res) => {
    try {
        const { employee, branch, date, preMonthInstallment, currentMonthInstallment } = req.body;
        if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
            return res.status(400).json({ success: false, message: 'Valid employee is required' });
        }

        const planDate = date ? new Date(date) : new Date();
        const monthYear = getMonthYear(planDate);

        const plan = await EmployeeAdvanceInstallmentPlan.findOneAndUpdate(
            { employee, monthYear },
            {
                $set: {
                    employee,
                    branch: branch || '',
                    date: planDate,
                    monthYear,
                    preMonthInstallment: preMonthInstallment !== undefined ? preMonthInstallment : { preBal: 0, installment: 0, balance: 0 },
                    currentMonthInstallment: currentMonthInstallment !== undefined ? currentMonthInstallment : { preBal: 0, installment: 0, balance: 0 },
                    updatedBy: req.user.id
                },
                $setOnInsert: {
                    createdBy: req.user.id
                }
            },
            { upsert: true, returnDocument: 'after', runValidators: true }
        );

        // Sync existing Payroll document if already created for this month
        try {
            const existingPayroll = await Payroll.findOne({ employee, monthYear });
            if (existingPayroll) {
                const inst1 = parseFloat(preMonthInstallment?.installment) || 0;
                const inst2 = parseFloat(currentMonthInstallment?.installment) || 0;
                const totalRec = inst1 + inst2;
                existingPayroll.pmAdvRec = inst1;
                existingPayroll.cmAdvRec = inst2;
                existingPayroll.totalAdvRec = totalRec;
                existingPayroll.totalAdv = totalRec;

                const gross = parseFloat(existingPayroll.grossTotal) || 0;
                const preTaxNet = Math.max(0, Math.round(gross - totalRec));
                existingPayroll.netTotal = preTaxNet;

                let wht = 0;
                if (existingPayroll.payFullSalaryThroughBank) {
                    const annualSalary = preTaxNet * 12;
                    if (annualSalary <= 600000) {
                        wht = 0;
                    } else if (annualSalary <= 1200000) {
                        wht = (annualSalary - 600000) * 0.01;
                    } else if (annualSalary <= 2200000) {
                        wht = 6000 + (annualSalary - 1200000) * 0.11;
                    } else if (annualSalary <= 3200000) {
                        wht = 116000 + (annualSalary - 2200000) * 0.23;
                    } else if (annualSalary <= 4100000) {
                        wht = 346000 + (annualSalary - 3200000) * 0.30;
                    } else {
                        wht = 616000 + (annualSalary - 4100000) * 0.35;
                    }
                    wht = Math.round(wht / 12);
                    existingPayroll.wht = wht;
                    existingPayroll.bankPaid = Math.max(0, preTaxNet - wht);
                    existingPayroll.cashPaid = 0;
                } else {
                    existingPayroll.wht = 0;
                    existingPayroll.bankPaid = 0;
                    existingPayroll.cashPaid = preTaxNet;
                }
                existingPayroll.bankAmt = existingPayroll.bankPaid;
                await existingPayroll.save();
            }
        } catch (syncErr) {
            console.error('Error syncing installment plan to existing payroll:', syncErr);
        }

        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Get single employee advance
// @route   GET /api/v1/employee-advances/:id
exports.getEmployeeAdvance = async (req, res) => {
    try {
        const advance = await EmployeeAdvance.findById(req.params.id)
            .populate({
                path: 'employee',
                populate: [
                    { path: 'designation', select: 'name' },
                    { path: 'department', select: 'name' }
                ]
            })
            .populate('department')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');
        if (!advance) {
            return res.status(404).json({ success: false, message: 'Advance not found' });
        }
        res.status(200).json({ success: true, data: advance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const { recalculateEmployeeLedger } = require('./employeeLedgerController');

// @desc    Helper to recalculate all running balances for an employee's advances
exports.recalculateAdvanceBalances = async (employeeId) => {
    try {
        const Employee = require('../models/Employee');
        const EmployeeAdvance = require('../models/EmployeeAdvance');

        const emp = await Employee.findById(employeeId);
        if (!emp) return;

        // 1. Get all advances sorted exactly like the ledger (temporal order)
        const advances = await EmployeeAdvance.find({ employee: employeeId })
            .sort({ date: 1, createdAt: 1 });

        // Group by month to calculate month-specific balances (matching frontend expectations)
        const monthlyGroups = {};
        advances.forEach(adv => {
            const d = new Date(adv.date);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlyGroups[key]) monthlyGroups[key] = [];
            monthlyGroups[key].push(adv);
        });

        // Sort month keys
        const sortedMonths = Object.keys(monthlyGroups).sort();

        let runningBalance = parseFloat(emp.opening || 0);

        const bulkOps = [];
        for (const monthKey of sortedMonths) {
            const monthAdvs = monthlyGroups[monthKey];
            const monthPreBal = runningBalance;

            // Calculate total net change for this month
            let monthNetChange = 0;
            monthAdvs.forEach(adv => {
                const amt = parseFloat(adv.paid || 0);
                monthNetChange += (adv.transactionType === 'Pay' ? amt : -amt);
            });

            // Update all records in this month to have the SAME closing balance
            // and the correct preMonth/currentMonth breakdown
            for (const adv of monthAdvs) {
                const amt = parseFloat(adv.paid || 0);
                const currentMonthBal = monthNetChange - (adv.transactionType === 'Pay' ? amt : -amt);
                const total = monthPreBal + currentMonthBal;
                const balance = monthPreBal + monthNetChange;

                bulkOps.push({
                    updateOne: {
                        filter: { _id: adv._id },
                        update: {
                            $set: {
                                preMonthBal: monthPreBal,
                                currentMonthBal: currentMonthBal,
                                total: total,
                                balance: balance
                            }
                        }
                    }
                });
            }

            // Update running balance for next month's starting point
            runningBalance += monthNetChange;
        }

        if (bulkOps.length > 0) {
            await EmployeeAdvance.bulkWrite(bulkOps);
        }
    } catch (err) {
        console.error('Error in recalculateAdvanceBalances:', err);
    }
};

// @desc    Create employee advance
// @route   POST /api/v1/employee-advances
exports.createEmployeeAdvance = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const advance = await EmployeeAdvance.create(req.body);

        // Audit Log
        await AuditLog.log({
            action: 'create',
            entity: 'advance',
            entityId: advance._id,
            changes: req.body,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            performedBy: req.user.id
        });

        // Sync Ledger
        if (advance.employee) {
            await recalculateEmployeeLedger(advance.employee);
            await exports.recalculateAdvanceBalances(advance.employee);
        }

        res.status(201).json({ success: true, data: advance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update employee advance
// @route   PUT /api/v1/employee-advances/:id
exports.updateEmployeeAdvance = async (req, res) => {
    try {
        const oldData = await EmployeeAdvance.findById(req.params.id).lean();

        const advance = await EmployeeAdvance.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!advance) {
            return res.status(404).json({ success: false, message: 'Advance not found' });
        }

        // Audit Log
        const fieldsToTrack = ['paid', 'transactionType', 'date', 'remarks', 'docMode'];
        const changes = {};
        let hasChanges = false;
        fieldsToTrack.forEach(field => {
            if (req.body[field] !== undefined && String(req.body[field]) !== String(oldData[field])) {
                changes[field] = { old: oldData[field], new: req.body[field] };
                hasChanges = true;
            }
        });

        if (hasChanges) {
            await AuditLog.log({
                action: 'update',
                entity: 'advance',
                entityId: advance._id,
                changes: changes,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                performedBy: req.user.id
            });
        }

        // Sync Ledger
        if (advance.employee) {
            await recalculateEmployeeLedger(advance.employee);
            await exports.recalculateAdvanceBalances(advance.employee);
        }

        res.status(200).json({ success: true, data: advance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete employee advance
// @route   DELETE /api/v1/employee-advances/:id
exports.deleteEmployeeAdvance = async (req, res) => {
    try {
        const advance = await EmployeeAdvance.findByIdAndDelete(req.params.id);
        if (!advance) {
            return res.status(404).json({ success: false, message: 'Advance not found' });
        }

        // Audit Log
        await AuditLog.log({
            action: 'delete',
            entity: 'advance',
            entityId: advance._id,
            changes: advance,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            performedBy: req.user.id
        });

        // Sync Ledger
        if (advance.employee) {
            await recalculateEmployeeLedger(advance.employee);
            await exports.recalculateAdvanceBalances(advance.employee);
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Employee Advance Activity Report
// @route   GET /api/v1/employee-advances/activity-report
exports.getEmployeeAdvanceActivityReport = async (req, res) => {
    try {
        const { startDate, endDate, branch, employee, code } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Start date and End date are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        // Adjust end date to cover the full day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. Employee Filter
        let empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
        if (employee) empQuery._id = employee;
        if (code) empQuery.code = code; // If code is provided instead of ID
        if (branch && branch !== 'All Branches') empQuery.branch = branch;
        // Default to active employees unless filtering for specific inactive one? 
        // Usually reports might need historical data for inactive too, but let's stick to active by default or all if filtered
        // The user didn't specify, but usually reports include everyone matching filter.

        const employees = await Employee.find(empQuery).sort({ code: 1 });
        const empIds = employees.map(e => e._id);

        // 2. Fetch All Advances for these employees (to calculate opening and current)
        // Optimization: Fetch all advances for these employees and process in memory
        // Since we need history for opening balance, fetching all is safer than complex aggregate for running balance
        const allAdvances = await EmployeeAdvance.find({
            employee: { $in: empIds }
        }).lean();

        const results = [];

        for (const emp of employees) {
            const empAdvs = allAdvances.filter(a => a.employee.toString() === emp._id.toString());

            // Calculate Opening Balance (Before Start Date)
            let openingBal = parseFloat(emp.opening || 0); // Initial opening from profile

            // Transactions before start date
            const preAdvs = empAdvs.filter(a => new Date(a.date) < start);
            preAdvs.forEach(a => {
                const amt = parseFloat(a.paid || 0);
                if (a.transactionType === 'Pay') openingBal += amt;
                else openingBal -= amt; // Received
            });

            // Transactions within range
            let currentAdvance = 0;
            let dedFromSalary = 0;

            const rangeAdvs = empAdvs.filter(a => {
                const d = new Date(a.date);
                return d >= start && d <= endOfDay;
            });

            rangeAdvs.forEach(a => {
                const amt = parseFloat(a.paid || 0);
                if (a.transactionType === 'Pay') {
                    currentAdvance += amt;
                } else {
                    dedFromSalary += amt; // Received (Recovery)
                }
            });

            // Logic:
            // Opening Bal: Balance before period
            // Current Advance: Advances taken during period
            // Total Advance: Opening + Current (According to screenshot logic? Or maybe User wants Opening + Current - Deduction?)
            // Screenshot check:
            // Row 1: Opening 70,000. Current 15,000. Total 85,000. Ded 0. Balance 85,000. (70k+15k = 85k). Correct.
            // Row 2: Opening 140,000. Current 0. Total 140,000. Ded 0. Balance 140,000. Correct.
            // Row 4: Opening 0. Current 7,000. Total 7,000. Ded 7,000. Balance 0. Correct. (7k-7k=0).

            const totalAdvance = openingBal + currentAdvance;
            const balance = totalAdvance - dedFromSalary;

            // Only include if there's some activity or non-zero balance?
            // Screenshot shows many rows. Usually report should show if there is ANY nonzero value.
            if (openingBal !== 0 || currentAdvance !== 0 || dedFromSalary !== 0 || balance !== 0) {
                results.push({
                    employeeId: emp._id,
                    code: emp.code,
                    name: emp.name,
                    basicSalary: emp.basicSalary || 0,
                    openingBalance: openingBal,
                    currentAdvance: currentAdvance,
                    totalAdvance: totalAdvance,
                    dedFromSalary: dedFromSalary,
                    balance: balance
                });
            }
        }

        res.status(200).json({ success: true, count: results.length, data: results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};
