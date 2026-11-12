const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const asyncHandler = require('../middleware/async');
const { applyBranchFilter } = require('../middleware/auth');

const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', ''].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

// @desc    Get Employee WHT Deduction Report (from Payroll data)
// @route   GET /api/v1/employees/reports/wh-ded-report
exports.getWhDedReport = asyncHandler(async (req, res, next) => {
    let query = {};
    
    // 1. Apply Filtering from query params (Initial requested branch)
    const branchRegex = makeBranchRegex(req.query.branch || req.query.branches);
    if (branchRegex) {
        query.branch = branchRegex;
    }

    // 2. ENFORCE BRANCH SECURITY (Overrides query if restricted)
    query = await applyBranchFilter(req, query, Payroll);
    
    // Convert ObjectIDs from frontend to String names for Payroll querying
    if (req.query.department) {
        const dept = await EmployeeDepartment.findById(req.query.department).lean();
        if (dept) {
            query.department = dept.name;
        }
    }
    
    if (req.query.designation) {
        const desig = await Designation.findById(req.query.designation).lean();
        if (desig) {
            query.designation = desig.name;
        }
    }

    // Exclude import-only payroll records
    query.isImportOnly = { $ne: true };

    // Date range filter — frontend now sends fromMonth/toMonth in YYYY-MM format
    if (req.query.fromMonth || req.query.toMonth) {
        let monthYearFilter = {};
        if (req.query.fromMonth) {
            monthYearFilter.$gte = req.query.fromMonth;
        }
        if (req.query.toMonth) {
            monthYearFilter.$lte = req.query.toMonth;
        }
        query.monthYear = monthYearFilter;
    }

    let effectiveMonthYear = null;

    // If no date filter provided, default to the latest monthYear with data
    if (!req.query.fromMonth && !req.query.toMonth) {
        const latestPayroll = await Payroll.findOne(query)
            .sort({ monthYear: -1 })
            .select('monthYear')
            .lean();
        if (latestPayroll) {
            effectiveMonthYear = latestPayroll.monthYear;
            if (req.query.metaOnly === 'true') {
                return res.status(200).json({
                    success: true,
                    monthYear: effectiveMonthYear
                });
            }
            query.monthYear = latestPayroll.monthYear;
        }
    } else {
        effectiveMonthYear = req.query.toMonth || req.query.fromMonth;
        if (req.query.metaOnly === 'true') {
            return res.status(200).json({
                success: true,
                monthYear: effectiveMonthYear
            });
        }
    }

    // Build active employee filter if needed
    let activeEmployeeIds = null;
    if (req.query.isActive === 'true') {
        const activeEmployees = await Employee.find({ isActive: true }).select('_id').lean();
        activeEmployeeIds = activeEmployees.map(e => e._id);
        query.employee = { $in: activeEmployeeIds };
    }
    if (req.query.isActive === 'false') {
        const inactiveEmployees = await Employee.find({ isActive: false }).select('_id').lean();
        activeEmployeeIds = inactiveEmployees.map(e => e._id);
        query.employee = { $in: activeEmployeeIds };
    }

    // Filter for non-zero WHT deduction
    if (req.query.hasDeduction === 'true') {
        query.wht = { $gt: 0 };
    }
    
    // Fetch payroll records with employee details populated
    const payrolls = await Payroll.find(query)
        .populate('employee', 'name cnic code')
        .sort({ branch: 1, code: 1 })
        .lean();

    // Net Total (report) = salary BEFORE WHT (pre-tax net from payroll)
    // Bank Paid (report) = salary AFTER WHT (what is actually paid through bank)
    const resolvePreTaxNet = (p) => {
        const wht = p.wht || 0;
        const advRec = p.totalAdvRec || 0;
        const gross = p.grossTotal || 0;
        const storedNet = p.netTotal || 0;
        const bankPaid = p.bankPaid || 0;

        // New format: netTotal = gross - advance (before WHT)
        if (storedNet > 0 && wht > 0 && bankPaid > 0 && storedNet > bankPaid) {
            return storedNet;
        }
        // Legacy format: netTotal was stored after WHT
        if (storedNet > 0 && wht > 0) {
            return Math.round(storedNet + wht);
        }
        if (storedNet > 0) return storedNet;
        if (gross > 0) return Math.max(0, Math.round(gross - advRec));
        return 0;
    };

    const resolveAfterWhtNet = (p, preTaxNet) => {
        const bankPaid = p.bankPaid || 0;
        if (bankPaid > 0) return bankPaid;
        return Math.max(0, Math.round(preTaxNet - (p.wht || 0)));
    };

    const resolveBankPaid = (p, afterWhtNet) => {
        if (p.bankPaid > 0) return p.bankPaid;
        if (p.payFullSalaryThroughBank && afterWhtNet > 0) return afterWhtNet;
        return 0;
    };

    const data = payrolls.map(p => {
        const preTaxNet = resolvePreTaxNet(p);
        const afterWhtNet = resolveAfterWhtNet(p, preTaxNet);
        return {
            name: p.employee ? p.employee.name : (p.code || '-'),
            cnic: p.employee ? p.employee.cnic : '-',
            netTotal: preTaxNet,
            whtDeduction: p.wht || 0,
            bankPaid: resolveBankPaid(p, afterWhtNet)
        };
    });

    res.status(200).json({
        success: true,
        count: data.length,
        monthYear: effectiveMonthYear,
        data
    });
});
