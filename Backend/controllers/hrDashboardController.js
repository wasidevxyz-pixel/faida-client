const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const SubBranch = require('../models/SubBranch');
const HolyDay = require('../models/HolyDay');
const Store = require('../models/Store');
const moment = require('moment');
const { employeeCache, attendanceCache } = require('../utils/memoryCache');

const getCacheKey = (...parts) => parts.filter(p => p !== undefined && p !== null && p !== '').join('_');

// TTL constants - Increased for better performance
const TTL_ATTENDANCE = 30 * 1000;        // 30 seconds  (live data)
const TTL_EMPLOYEES = 15 * 60 * 1000;   // 15 minutes (was 5) - employees change rarely
const TTL_PAYROLL = 10 * 60 * 1000;     // 10 minutes (was 5) - payroll finalized monthly
const TTL_STATIC = 30 * 60 * 1000;      // 30 minutes (was 10) - departments, designations

const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', ''].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

const parseToHrs = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str.includes(':')) {
        const [h, m] = str.split(':').map(Number);
        return (h || 0) + ((m || 0) / 60);
    }
    return parseFloat(str) || 0;
};

const getRecordHrs = (r) => {
    if (!r) return 0;
    let hrs = parseToHrs(r.totalHrs || r.workedHrs);
    // Fallback: Calculate from check-in/out if hours are zero but times exist
    if (hrs <= 0 && r.checkIn && r.checkOut && r.checkOut !== '-' && r.checkOut !== '0:00') {
        try {
            const start = moment(r.checkIn, ['h:mm A', 'H:mm', 'HH:mm']);
            let end = moment(r.checkOut, ['h:mm A', 'H:mm', 'HH:mm']);
            if (end.isBefore(start)) end.add(1, 'day'); // Handle midnight crossing
            hrs = end.diff(start, 'hours', true);
        } catch (e) {
            return 0;
        }
    }
    return hrs || 0;
};

const { applyBranchFilter } = require('../middleware/auth');

// @desc    Get HR Dashboard Summary
// @route   GET /api/v1/hr-dashboard/summary
// @access  Private
exports.getHRDashboardSummary = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation, status, search } = req.query;
    const tMoment = date ? moment(date) : moment();
    const startOfDay = tMoment.clone().startOf('day').toDate();
    const endOfDay = tMoment.clone().endOf('day').toDate();
    const targetBranch = (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) ? branch : null;

    // 1. Employee Query
    let empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
    if (targetBranch) empQuery.branch = targetBranch;
    
    // Apply branch level restriction
    empQuery = await applyBranchFilter(req, empQuery, Employee);

    if (department && department !== 'Select Department' && department !== 'All Depts') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) empQuery.department = deptDoc._id;
        else empQuery.department = null;
    }

    if (designation && designation !== 'Select Designation') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) empQuery.designation = desigDoc._id;
        else empQuery.designation = null;
    }

    // Apply search filter to employee query
    if (search && search.trim()) {
        const term = search.trim();
        empQuery.$or = [
            { name: { $regex: term, $options: 'i' } },
            { code: { $regex: term, $options: 'i' } }
        ];
    }

    const empCacheKey = `emp_summary_${JSON.stringify(empQuery)}`;

    // Attendance query (needed in parallel)
    const attRangeQuery = {
        date: { $gte: startOfDay, $lte: endOfDay },
    };
    if (targetBranch) attRangeQuery.branch = targetBranch;
    const attCacheKey = `att_summary_${date}_${targetBranch}_${JSON.stringify(empQuery)}`;

    let employees = employeeCache.get(empCacheKey);
    let attendanceRecords = employees ? attendanceCache.get(attCacheKey) : null;

    if (!employees || !attendanceRecords) {
        // Run both queries in parallel for speed
        const [freshEmployees, freshAttendance] = await Promise.all([
            employees ? null : Employee.find(empQuery)
                .select('name code branch department designation fDutyTime totalHrs religion thirtyWorkingDays')
                .populate('department', 'name')
                .populate('designation', 'name')
                .lean(),
            attendanceRecords ? null : Attendance.find({
                date: { $gte: startOfDay, $lte: endOfDay }
            }).select('employee date branch displayStatus checkIn checkOut totalHrs isPresent').lean()
        ]);

        if (freshEmployees) {
            employees = freshEmployees;
            employeeCache.set(empCacheKey, employees, TTL_EMPLOYEES);
        }
        if (freshAttendance) {
            // Filter attendance by employee IDs if needed
            const empIdSet = new Set(employees.map(e => e._id.toString()));
            attendanceRecords = freshAttendance.filter(a => empIdSet.has(a.employee.toString()));
            attendanceCache.set(attCacheKey, attendanceRecords, TTL_ATTENDANCE);
        }
    }

    const totalEmployees = employees.length;

    // 3. Merge Results: All Employees + Attendance Data
    let combinedRecords = employees.map(emp => {
        const att = attendanceRecords.find(a => a.employee.toString() === emp._id.toString());

        if (att) {
            const record = { ...att, employee: emp };

            // Calc Late Arrivals
            if (record.displayStatus === 'Present' && record.checkIn && emp.fDutyTime) {
                try {
                    const checkInMoment = moment(record.checkIn, ['h:mm A', 'H:mm']);
                    const dutyStartMoment = moment(emp.fDutyTime, ['h:mm A', 'H:mm']);
                    if (checkInMoment.isAfter(dutyStartMoment.add(10, 'minutes'))) {
                        record.isLate = true;
                    }
                } catch (e) { }
            }

            // Dynamic Status Logic
            if (record.displayStatus === 'Present' && record.totalHrs) {
                const duty = 8;
                const completion = (record.totalHrs / duty) * 100;
                record.calculatedStatus = (completion < 100 && completion > 0) ? 'Poor' : 'Present';
            } else {
                record.calculatedStatus = record.displayStatus;
            }
            return record;
        } else {
            // Not Marked Record
            return {
                employee: emp,
                date: tMoment.toDate(),
                displayStatus: 'Not Marked',
                calculatedStatus: 'Not Marked',
                checkIn: '-',
                checkOut: '-',
                totalHrs: 0,
                remarks: '-'
            };
        }
    });

    const presentCount = combinedRecords.filter(r => r.displayStatus === 'Present').length;
    const absentCount = combinedRecords.filter(r => r.displayStatus === 'Absent').length;
    const leaveCount = combinedRecords.filter(r => r.displayStatus === 'Leave').length;
    const lateCount = combinedRecords.filter(r => r.isLate).length;
    const notMarkedCount = combinedRecords.filter(r => r.displayStatus === 'Not Marked').length;

    // Apply status filter if requested
    if (status && status !== 'All Status') {
        combinedRecords = combinedRecords.filter(r =>
            r.displayStatus === status || r.calculatedStatus === status
        );
    }

    const performanceAvg = totalEmployees > 0 ? ((presentCount / totalEmployees) * 100).toFixed(1) : 0;

    res.status(200).json({
        success: true,
        data: {
            totalEmployees,
            presentCount,
            absentCount,
            lateCount,
            leaveCount,
            notMarkedCount,
            performanceAvg,
            attendance: combinedRecords,
            notMarkedList: combinedRecords.filter(r => r.displayStatus === 'Not Marked').map(r => r.employee)
        }
    });
});

// @desc    Get Branch Wise Salary Stats
// @route   GET /api/v1/hr-dashboard/branch-salary
// @access  Private
exports.getBranchSalaryStats = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation } = req.query;

    // Default to current month if no date provided
    const tMoment = date ? moment(date) : moment();
    const targetMonthYear = tMoment.format('YYYY-MM');

    // Filter Logic (Standardized for HR Dashboard)
    const targetBranch = (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) ? branch : null;

    // Check if payroll exists for this specific month
    const payrollExists = await Payroll.exists({ monthYear: targetMonthYear });

    if (payrollExists) {
        console.log(`?? Loading Branch Salary stats from PAYROLL for ${targetMonthYear}`);

        // Build match query
        const matchQuery = { monthYear: targetMonthYear };
        if (targetBranch) matchQuery.branch = targetBranch;
        
        if (department && department !== 'All Depts' && department !== 'Select Department') {
            const EmployeeDepartment = require('../models/EmployeeDepartment');
            const deptDoc = await EmployeeDepartment.findOne({ name: department });
            if (deptDoc) matchQuery.department = deptDoc._id;
        }
        
        if (designation && designation !== 'Select Designation') {
            const Designation = require('../models/Designation');
            const desigDoc = await Designation.findOne({ name: designation });
            if (desigDoc) matchQuery.designation = desigDoc._id;
        }

        const stats = await Payroll.aggregate([
            { $match: matchQuery },
            // Join with Employee to filter out import-only duplicates
            {
                $lookup: {
                    from: 'employees',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'empDoc'
                }
            },
            { $unwind: '$empDoc' },
            { $match: { 
                'empDoc.payrollImportOnly': { $ne: true },
                'empDoc.code': { $not: /^IMP-/i }
            } },
            {
                $group: {
                    _id: { $toUpper: { $trim: { input: '$branch' } } }, // Normalize branch name to prevent duplicates
                    totalBasicSalary: { $sum: '$perMonth' },
                    totalAllowances: { $sum: { $subtract: ['$earningsTotal', '$overTime'] } }, // Approx other allowances
                    totalOvertime: { $sum: '$overTime' },
                    totalDeductions: {
                        $sum: {
                            $add: [
                                '$shortTimeAmount',
                                '$totalAdvRec',
                                '$penalty',
                                '$ttw',
                                '$fund',
                                '$ugrm',
                                '$securityDeposit',
                                '$ebDeduction'
                            ]
                        }
                    },
                    totalNetSalary: { $sum: '$netTotal' },
                    employeeCount: { $sum: 1 }
                }
            },
            { $sort: { totalNetSalary: -1 } }
        ]);

        return res.status(200).json({
            success: true,
            data: stats,
            source: 'payroll',
            monthYear: targetMonthYear
        });
    } else {
        console.log(`?? Payroll not found for ${targetMonthYear}, falling back to employee master estimates`);

        // Build match query for Employee fallback
        const matchQuery = { 
            isActive: true, 
            payrollImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        };
        if (targetBranch) matchQuery.branch = targetBranch;

        if (department && department !== 'All Depts' && department !== 'Select Department') {
            const EmployeeDepartment = require('../models/EmployeeDepartment');
            const deptDoc = await EmployeeDepartment.findOne({ name: department });
            if (deptDoc) matchQuery.department = deptDoc._id;
        }

        if (designation && designation !== 'Select Designation') {
            const Designation = require('../models/Designation');
            const desigDoc = await Designation.findOne({ name: designation });
            if (desigDoc) matchQuery.designation = desigDoc._id;
        }

        // Fallback to Employee Master Data (Estimate based on basic salary)
        const stats = await Employee.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: { $toUpper: { $trim: { input: '$branch' } } }, // Normalize branch name
                    totalBasicSalary: { $sum: '$basicSalary' },
                    employeeCount: { $sum: 1 }
                }
            },
            { $sort: { totalBasicSalary: -1 } }
        ]);


        // Map to same structure for frontend
        const mappedStats = stats.map(s => ({
            ...s,
            totalAllowances: 0,
            totalOvertime: 0,
            totalDeductions: 0,
            totalNetSalary: s.totalBasicSalary
        }));

        res.status(200).json({
            success: true,
            data: mappedStats,
            source: 'employee',
            monthYear: targetMonthYear
        });
    }
});

// @desc    Get Employee Advance Summary
// @route   GET /api/v1/hr-dashboard/advance-summary
// @access  Private
exports.getAdvanceSummary = asyncHandler(async (req, res, next) => {
    const { date, fromDate, toDate, branch, department, designation, employee, code, reportType, search } = req.query;

    // Prefer explicit fromDate/toDate; fall back to month of selected date
    const tMoment = date ? moment(date) : moment();
    const start = fromDate ? moment(fromDate).startOf('day').toDate() : tMoment.clone().startOf('month').toDate();
    const end = toDate ? moment(toDate).endOf('day').toDate() : tMoment.clone().endOf('month').toDate();

    // 1. Employee Filter
    let empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
    if (employee) empQuery._id = employee;
    if (code) empQuery.code = code;
    if (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) empQuery.branch = branch;

    // Apply branch level restriction to respect user access permissions
    empQuery = await applyBranchFilter(req, empQuery, Employee);

    if (search) {
        empQuery.$or = [
            { name: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } }
        ];
    }

    if (department && department !== 'All Depts' && department !== 'Select Department') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) empQuery.department = deptDoc._id;
        else empQuery.department = null;
    }

    if (designation && designation !== 'Select Designation') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) empQuery.designation = desigDoc._id;
        else empQuery.designation = null;
    }

    const empAdvCacheKey = `emp_advance_${JSON.stringify(empQuery)}`;
    let employees = employeeCache.get(empAdvCacheKey);
    if (!employees) {
        employees = await Employee.find(empQuery)
            .select('name code branch department designation basicSalary opening')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ code: 1 })
            .lean();
        employeeCache.set(empAdvCacheKey, employees, TTL_EMPLOYEES);
    }

    const empIds = employees.map(e => e._id);

    // 2. Fetch All Advances for these employees to calc opening and current
    const advCacheKey = `advances_${JSON.stringify(empIds)}`;
    let allAdvances = attendanceCache.get(advCacheKey);
    if (!allAdvances) {
        allAdvances = await EmployeeAdvance.find({ employee: { $in: empIds } }).lean();
        attendanceCache.set(advCacheKey, allAdvances, TTL_STATIC);
    }

    const results = [];
    let totalOpeningSum = 0;
    let totalCurrentSum = 0;
    let totalAdvanceSum = 0;

    for (const emp of employees) {
        const empAdvs = allAdvances.filter(a => a.employee.toString() === emp._id.toString());

        // Calculate Opening Balance (Before Start Date)
        let openingBal = parseFloat(emp.opening || 0);
        const preAdvs = empAdvs.filter(a => new Date(a.date) < start);
        preAdvs.forEach(a => {
            const amt = parseFloat(a.paid || 0);
            if (a.transactionType === 'Pay') openingBal += amt;
            else openingBal -= amt;
        });

        // Transactions within range
        let currentAdvance = 0;
        let dedFromSalary = 0;

        const rangeAdvs = empAdvs.filter(a => {
            const d = new Date(a.date);
            return d >= start && d <= end;
        });

        rangeAdvs.forEach(a => {
            const amt = parseFloat(a.paid || 0);
            if (a.transactionType === 'Pay') {
                currentAdvance += amt;
            } else {
                dedFromSalary += amt;
            }
        });

        const totalAdvance = openingBal + currentAdvance;
        const balance = totalAdvance - dedFromSalary;

        // Find latest date for current advances in the range
        let advanceDateStr = tMoment.format('MMM YYYY');
        if (rangeAdvs.length > 0) {
            // Sort to get latest pay date
            const latestPay = rangeAdvs
                .filter(a => a.transactionType === 'Pay')
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (latestPay) {
                advanceDateStr = moment(latestPay.date).format('YYYY-MM-DD');
            }
        }

        // Skip if no interaction and no balance
        if (openingBal === 0 && currentAdvance === 0 && dedFromSalary === 0 && balance === 0) continue;

        // Filter based on reportType if applicable for summary view
        if (reportType === 'Advance Pay Only' && currentAdvance === 0) continue;
        if (reportType === 'Advance Received Only' && dedFromSalary === 0) continue;
        if (reportType === 'Opening Balance Only' && openingBal === 0) continue;

        results.push({
            code: emp.code,
            name: emp.name,
            branch: emp.branch || '-',
            department: emp.department?.name || '-',
            designation: emp.designation?.name || '-',
            month: advanceDateStr,
            basicSalary: emp.basicSalary || 0,
            openingBalance: openingBal,
            currentAdvance: currentAdvance,
            totalAdvance: totalAdvance,
            dedFromSalary: dedFromSalary,
            balance: balance
        });

        totalOpeningSum += openingBal;
        totalCurrentSum += currentAdvance;
        totalAdvanceSum += totalAdvance;
    }

    res.status(200).json({
        success: true,
        data: {
            totalOpening: totalOpeningSum,
            totalCurrent: totalCurrentSum,
            totalAdvance: totalAdvanceSum,
            totalRecords: results.length,
            list: results
        }
    });
});

// @desc    Get All Salary List (Payroll Records)
// @route   GET /api/v1/hr-dashboard/salary-list
// @access  Private
exports.getSalaryList = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation, employee, search, fromDate, toDate } = req.query;

    let query = { code: { $not: /^IMP-/i } };
    if (fromDate && toDate) {
        const startMonth = moment(fromDate).format('YYYY-MM');
        const endMonth = moment(toDate).format('YYYY-MM');
        query.monthYear = { $gte: startMonth, $lte: endMonth };
    } else if (fromDate) {
        const startMonth = moment(fromDate).format('YYYY-MM');
        query.monthYear = { $gte: startMonth };
    } else if (toDate) {
        const endMonth = moment(toDate).format('YYYY-MM');
        query.monthYear = { $lte: endMonth };
    } else {
        // Fallback to monthYear filter from the main date picker
        const tMoment = date ? moment(date) : moment();
        query.monthYear = tMoment.format('YYYY-MM');
    }

    // When a specific employee is selected, do NOT restrict to a single branch or department so historical slips from prior branches appear
    if (!employee) {
        if (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) {
            query.branch = branch;
        }

        // Apply branch level restriction to respect user access permissions
        query = await applyBranchFilter(req, query, Payroll);

        if (department && department !== 'All Depts' && department !== 'Select Department') {
            query.department = department;
        }

        if (designation && designation !== 'Select Designation') {
            query.designation = designation;
        }
    }

    if (employee) {
        try {
            const empDoc = await Employee.findById(employee).select('_id code name cnic').lean();
            if (empDoc) {
                const matchConditions = [{ _id: empDoc._id }];
                if (empDoc.code) matchConditions.push({ code: empDoc.code });
                if (empDoc.cnic && empDoc.cnic.trim()) matchConditions.push({ cnic: empDoc.cnic.trim() });

                const relatedEmps = await Employee.find({ $or: matchConditions }).select('_id code').lean();
                const allEmpIds = relatedEmps.map(e => e._id);
                const allEmpCodes = relatedEmps.map(e => e.code).filter(Boolean);

                query.$or = [
                    { employee: { $in: allEmpIds } },
                    ...(allEmpCodes.length > 0 ? [{ code: { $in: allEmpCodes } }] : [])
                ];
            } else {
                query.employee = employee;
            }
        } catch (err) {
            query.employee = employee;
        }
    } else if (search && search.trim()) {
        // Optional: Search by name/code across all records in that month
        const searchRegex = { $regex: search.trim(), $options: 'i' };

        // Find employees matching name or code
        const matchingEmployees = await Employee.find({
            $or: [
                { name: searchRegex },
                { code: searchRegex }
            ]
        }).select('_id').lean();

        const empIds = matchingEmployees.map(e => e._id);

        query.$or = [
            { code: searchRegex }, // Denormalized code on Payroll
            { employee: { $in: empIds } } // Match by joined employee
        ];
    }

    // ─── PHASE 1/2: Hard Pagination + Lean ──────────────────────
    const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const payrollListCacheKey = `payroll_list_${JSON.stringify(query)}_p${page}_l${limit}`;
    let cached = employeeCache.get(payrollListCacheKey);
    if (cached) {
        return res.status(200).json({ success: true, ...cached, fromCache: true });
    }

    const sortOrder = employee ? { monthYear: 1, createdAt: 1 } : { code: 1, monthYear: 1 };
    const [payrolls, totalCount] = await Promise.all([
        Payroll.find(query)
            .select('employee monthYear branch code department designation netTotal grossTotal workedDays workedHrs penalty totalAdv pAAdv csMale earningsTotal deductionsTotal perMonth createdAt overTime rent natin monthlyComm ugComm warehouseComm teaAllowance stLateAllow otherAllow shortWeek wht securityDeposit ttw fund ugrm bankPaid cashPaid pmAdvRec cmAdvRec totalAdvRec food ebDeduction shortTimeAmount otherDeduction umrahDeduction remarks branchBank')
            .populate('employee', 'name code photo')
            .sort(sortOrder)
            .skip(skip)
            .limit(limit)
            .lean(),
        Payroll.countDocuments(query)
    ]);

    const result = { count: payrolls.length, totalCount, totalPages: Math.ceil(totalCount / limit), currentPage: page, data: payrolls };
    employeeCache.set(payrollListCacheKey, result, TTL_PAYROLL);

    res.status(200).json({ success: true, ...result });
});


// @desc    Get Salary Details (Employee Master Data)
// @route   GET /api/v1/hr-dashboard/salary-detail
// @access  Private
exports.getSalaryDetail = asyncHandler(async (req, res, next) => {
    const { branch, department, designation, search } = req.query;
    const targetBranch = branch && !['all branches', 'all', 'select branch'].includes(String(branch).trim().toLowerCase())
        ? branch
        : null;

    const query = { 
        isActive: true, 
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    };
    if (targetBranch) {
        query.branch = targetBranch;
    }

    // Apply branch level restriction to respect user access permissions
    const restrictedQuery = await applyBranchFilter(req, query, Employee);

    if (targetBranch && restrictedQuery.branch !== '__NOT_ALLOWED_BRANCH__' && !Array.isArray(restrictedQuery.branch?.$in)) {
        const stripped = targetBranch.toString().trim().replace(/^\(|\)$/g, '');
        const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        restrictedQuery.branch = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
    }

    if (department && department !== 'All Depts' && department !== 'Select Department') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) restrictedQuery.department = deptDoc._id;
    }

    if (designation && designation !== 'Select Designation') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) restrictedQuery.designation = desigDoc._id;
    }

    // Name / code search from Employee Search text input
    if (search && search.trim()) {
        restrictedQuery.$or = [
            { name: { $regex: search.trim(), $options: 'i' } },
            { code: { $regex: search.trim(), $options: 'i' } }
        ];
    }

    // Use getCacheKey with req.user._id to prevent caching restricted data for admins or vice-versa
    const userIdStr = req.user?._id ? req.user._id.toString() : (req.userId ? String(req.userId) : 'guest');
    const salDetailCacheKey = getCacheKey('sal_detail', targetBranch, department, designation, search, userIdStr);
    let employees = employeeCache.get(salDetailCacheKey);
    console.log('[getSalaryDetail] targetBranch:', targetBranch, 'cacheKey:', salDetailCacheKey, 'cached:', !!employees);
    if (!employees) {
        employees = await Employee.find(restrictedQuery)
            .select('name code branch basicSalary fixAllowance otherAllowance stLoss commission eobi department designation joiningDate incrDate isActive')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ code: 1 })
            .lean();
        console.log('[getSalaryDetail] DB fetched employees count:', employees.length);
        employeeCache.set(salDetailCacheKey, employees, TTL_EMPLOYEES);
    }

    res.status(200).json({
        success: true,
        count: employees.length,
        data: employees
    });
});

// @desc    Get Overtime/ShortTime Stats
// @route   GET /api/v1/hr-dashboard/ot-st
// @access  Private
exports.getOvertimeShorttime = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation, employee, otstType, search, code } = req.query;

    // 1. Setup Month Range & Month-Year string
    const tMoment = date ? moment(date) : moment();
    const targetMonthYear = tMoment.format('YYYY-MM');

    // 2. Employee Query
    const empQuery = { 
        isActive: true, 
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    };
    const targetBranch = (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) ? branch : null;
    if (targetBranch) empQuery.branch = targetBranch;

    // Apply branch level restriction to respect user access permissions
    const restrictedEmpQuery = await applyBranchFilter(req, empQuery, Employee);

    if (department && department !== 'All Depts' && department !== 'Select Department') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) restrictedEmpQuery.department = deptDoc._id;
    }

    if (designation && designation !== 'Select Designation') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) restrictedEmpQuery.designation = desigDoc._id;
    }

    if (employee) restrictedEmpQuery._id = employee;

    // Name / code search from Employee Search text input
    if (search && search.trim()) {
        restrictedEmpQuery.$or = [
            { name: { $regex: search.trim(), $options: 'i' } },
            { code: { $regex: search.trim(), $options: 'i' } }
        ];
    } else if (code) {
        restrictedEmpQuery.code = new RegExp(code, 'i');
    }

    const otstEmpCacheKey = `emp_otst_${JSON.stringify(restrictedEmpQuery)}`;
    let employees = employeeCache.get(otstEmpCacheKey);
    if (!employees) {
        employees = await Employee.find(restrictedEmpQuery)
            .select('name code branch basicSalary totalHrs perHr photo department designation')
            .populate('department', 'name')
            .populate('designation', 'name')
            .lean();
        employeeCache.set(otstEmpCacheKey, employees, TTL_EMPLOYEES);
    }

    const empIds = employees.map(e => e._id);

    // 3. Fetch Payroll records for the month (Primary Source)
    const otstPayrollCacheKey = `payroll_otst_${targetMonthYear}_${JSON.stringify(empIds)}`;
    let payrolls = attendanceCache.get(otstPayrollCacheKey);
    if (!payrolls) {
        payrolls = await Payroll.find({ employee: { $in: empIds }, monthYear: targetMonthYear })
            .select('employee monthYear overTime overTimeHrs shortTimeHrs totalHrsPerMonth workedHrs totalHrsPerDay').lean();
        attendanceCache.set(otstPayrollCacheKey, payrolls, TTL_PAYROLL);
    }

    // 4. Fallback: If no payroll, calculate from Attendance (Live data)
    let attendance = [];
    if (payrolls.length < empIds.length) {
        const startOfMonth = tMoment.clone().startOf('month').toDate();
        const endOfMonth = tMoment.clone().endOf('month').toDate();
        const otstAttCacheKey = `att_otst_${targetMonthYear}_${JSON.stringify(empIds)}`;
        attendance = attendanceCache.get(otstAttCacheKey);
        if (!attendance) {
            attendance = await Attendance.find({
                employee: { $in: empIds },
                date: { $gte: startOfMonth, $lte: endOfMonth }
            }).select('employee date checkIn checkOut displayStatus breakIn breakOut timeDiffIn timeDiffOut diffMode totalHrs workedHrs').lean();
            attendanceCache.set(otstAttCacheKey, attendance, TTL_ATTENDANCE);
        }
    }

    // 5. Aggregate Results (One row per employee)
    const daysInMonth = tMoment.daysInMonth();
    let workingDaysCount = 0;
    for (let i = 1; i <= daysInMonth; i++) {
        const day = tMoment.clone().date(i);
        if (day.day() !== 0) workingDaysCount++; // 0 = Sunday
    }
    const divisorDays = Math.max(1, workingDaysCount);

    const results = employees.map(emp => {
        const p = payrolls.find(pr => pr.employee.toString() === emp._id.toString());

        let reqHrs = 0, workedHrs = 0, dutyHrs = 0, cmDays = divisorDays, otHrs = 0, stHrs = 0, otRs = 0, stRs = 0;

        let duty = 0;
        if (emp.totalHrs) {
            const parsed = parseFloat(String(emp.totalHrs));
            if (!isNaN(parsed) && parsed > 0) duty = parsed;
        }
        if (!duty) duty = 8;
        dutyHrs = duty;

        const salValue = emp.basicSalary || (p ? p.perMonth : 0) || 0;
        const hourlyRate = (dutyHrs > 0) ? (salValue / divisorDays / dutyHrs) : 0;

        if (p) {
            // Use finalized Payroll data
            reqHrs = p.totalHrsPerMonth || (divisorDays * dutyHrs);
            workedHrs = p.workedHrs || 0;
            dutyHrs = p.totalHrsPerDay || duty;
            cmDays = p.totalWdsPerMonth || divisorDays;
            otHrs = p.overTimeHrs || 0;
            stHrs = p.shortTimeHrs || 0;
            otRs = p.overTime || (otHrs * hourlyRate);
            stRs = p.shortTimeAmount || (stHrs * hourlyRate);
        } else {
            // Live Calculation from Attendance using daily shifts
            const empAttendance = attendance.filter(a => a.employee.toString() === emp._id.toString());
            const dutyMins = Math.round(dutyHrs * 60);

            let empWorkedMins = 0;
            let empOTMins = 0;
            let empSTMins = 0;

            empAttendance.forEach(rec => {
                if (!rec || rec.displayStatus === 'Absent') return;
                let wMins = 0;
                if (rec.totalHrs && typeof rec.totalHrs === 'number' && rec.totalHrs > 0) {
                    wMins = Math.round(rec.totalHrs * 60);
                } else if (rec.checkIn && rec.checkOut) {
                    const inHrs = getRecordHrs(rec);
                    wMins = Math.round(inHrs * 60);
                }
                if (wMins <= 0) return;

                empWorkedMins += wMins;
                const diff = wMins - dutyMins;
                if (diff > 0) empOTMins += diff;
                else if (diff < 0) empSTMins += Math.abs(diff);
            });

            reqHrs = divisorDays * dutyHrs;
            workedHrs = (empWorkedMins / 60);

            const monthlyDiff = workedHrs - reqHrs;
            if (monthlyDiff > 0) {
                otHrs = monthlyDiff;
                stHrs = 0;
            } else if (monthlyDiff < 0) {
                otHrs = 0;
                stHrs = Math.abs(monthlyDiff);
            } else {
                otHrs = 0;
                stHrs = 0;
            }

            otRs = otHrs * hourlyRate;
            stRs = stHrs * hourlyRate;
        }

        // Filter by Type
        if (otstType === 'Over Time' && otHrs <= 0) return null;
        if (otstType === 'Short Time' && stHrs <= 0) return null;
        if (!otstType && otHrs <= 0 && stHrs <= 0) return null;

        const monthlyDiff = workedHrs - reqHrs;

        return {
            date: tMoment.format('MMMM-YYYY'),
            branch: emp.branch || '-',
            code: emp.code,
            name: emp.name,
            department: emp.department?.name || '-',
            designation: emp.designation?.name || '-',
            reqHrs: Number(reqHrs).toFixed(2),
            workedHrs: Number(workedHrs).toFixed(2),
            monthlyDiff: (monthlyDiff >= 0 ? '+' : '') + Number(monthlyDiff).toFixed(2),
            dutyHrs: Number(dutyHrs).toFixed(2),
            cmDays: cmDays,
            otHrs: Number(otHrs).toFixed(2),
            otRs: Math.round(otRs || 0),
            stHrs: Number(stHrs).toFixed(2),
            stRs: Math.round(stRs || 0),
            netRs: Math.round((otRs || 0) - (stRs || 0))
        };
    }).filter(r => r !== null);

    res.status(200).json({
        success: true,
        count: results.length,
        data: results
    });
});

// @desc    Get Increments List
// @route   GET /api/v1/hr-dashboard/increments
// @access  Private
exports.getIncrements = asyncHandler(async (req, res, next) => {
    const { branch, department, designation, date, search } = req.query;
    const query = { 
        isActive: true, 
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    };

    if (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) {
        query.branch = branch;
    }

    // Apply branch level restriction to respect user access permissions
    const restrictedQuery = await applyBranchFilter(req, query, Employee);

    if (department && department !== 'All Depts' && department !== 'Select Department') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) restrictedQuery.department = deptDoc._id;
        else restrictedQuery.department = null;
    }

    if (designation && designation !== 'Select Designation') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) restrictedQuery.designation = desigDoc._id;
        else restrictedQuery.designation = null;
    }

    // Name / code search from Employee Search text input
    if (search && search.trim()) {
        restrictedQuery.$or = [
            { name: { $regex: search.trim(), $options: 'i' } },
            { code: { $regex: search.trim(), $options: 'i' } }
        ];
    }

    const incrCacheKey = `emp_incr_${JSON.stringify(restrictedQuery)}`;
    let employees = employeeCache.get(incrCacheKey);
    if (!employees) {
        employees = await Employee.find(restrictedQuery)
            .select('name code branch incrDate joiningDate basicSalary fixAllowance otherAllowance department designation photo')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ branch: 1, code: 1 })
            .lean();
        employeeCache.set(incrCacheKey, employees, TTL_EMPLOYEES);
    }

    // Filter: show only employees whose NEXT increment date (incrDate + 1yr)
    // falls in the same MONTH AND YEAR as the selected date
    if (date) {
        const targetMonth = moment(date).month(); // 0-11
        const targetYear = moment(date).year();
        employees = employees.filter(emp => {
            const lastDate = emp.incrDate || emp.joiningDate;
            if (!lastDate) return false;
            
            const lastMoment = moment(lastDate);
            const nextDueYear = lastMoment.year() + 1;
            const nextDueMonth = lastMoment.month(); // 0-11
            
            // Show if next due date month matches target month AND year is EXACTLY target year
            return nextDueMonth === targetMonth && nextDueYear === targetYear;
        });
    }

    res.status(200).json({
        success: true,
        count: employees.length,
        data: employees
    });
});

// @desc    Get Hours Tracking (Payroll Summary Logic)
// @route   GET /api/v1/hr-dashboard/hours-tracking
// @access  Private
exports.getHoursTracking = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation, status, code, search } = req.query;
    const tMoment = date ? moment(date) : moment();

    // We calculate for the WHOLE MONTH of the selected date
    const startOfMonth = tMoment.clone().startOf('month').toDate();
    const endOfMonth = tMoment.clone().endOf('month').toDate();
    const daysInMonth = tMoment.daysInMonth();

    // 1. Employee Query
    const empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
    if (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) empQuery.branch = branch;

    // Apply branch level restriction to respect user access permissions
    const restrictedEmpQuery = await applyBranchFilter(req, empQuery, Employee);

    // Resolve Dept/Desig Names to IDs if provided
    if (department && department !== 'Select Department' && department !== 'All') {
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const deptDoc = await EmployeeDepartment.findOne({ name: department });
        if (deptDoc) restrictedEmpQuery.department = deptDoc._id;
        else restrictedEmpQuery.department = null; // Forces empty result if dept not found
    }

    if (designation && designation !== 'Select Designation' && designation !== 'All') {
        const Designation = require('../models/Designation');
        const desigDoc = await Designation.findOne({ name: designation });
        if (desigDoc) restrictedEmpQuery.designation = desigDoc._id;
        else restrictedEmpQuery.designation = null;
    }

    // Search by employee name OR code (from globalSearch input)
    if (search && search.trim()) {
        restrictedEmpQuery.$or = [
            { name: { $regex: search.trim(), $options: 'i' } },
            { code: { $regex: search.trim(), $options: 'i' } }
        ];
    } else if (code) {
        restrictedEmpQuery.code = { $regex: code, $options: 'i' };
    }

    // Fetch Employees
    const htEmpCacheKey = `emp_ht_${JSON.stringify(restrictedEmpQuery)}`;
    let employees = employeeCache.get(htEmpCacheKey);
    if (!employees) {
        employees = await Employee.find(restrictedEmpQuery)
            .select('name code branch department designation fDutyTime tDutyTime totalHrs thirtyWorkingDays religion')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ code: 1 })
            .lean();
        employeeCache.set(htEmpCacheKey, employees, TTL_EMPLOYEES);
    }

    // 2. Attendance Query
    const htAttCacheKey = `att_ht_${startOfMonth.toISOString()}_${JSON.stringify(employees.map(e => e._id))}`;
    let allAttendance = attendanceCache.get(htAttCacheKey);
    if (!allAttendance) {
        allAttendance = await Attendance.find({
            date: { $gte: startOfMonth, $lte: endOfMonth },
            employee: { $in: employees.map(e => e._id) }
        }).select('employee date displayStatus checkIn totalHrs workedHrs isPresent').lean();
        attendanceCache.set(htAttCacheKey, allAttendance, TTL_ATTENDANCE);
    }

    // 3. Holy Days Cache
    const hdCacheKey = `holidays_${startOfMonth.toISOString()}`;
    let holyDays = employeeCache.get(hdCacheKey);
    if (!holyDays) {
        holyDays = await HolyDay.find({
            isActive: true,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        });
        employeeCache.set(hdCacheKey, holyDays, TTL_STATIC);
    }

    const reportData = [];
    const religionMap = {};
    holyDays.forEach(hd => {
        if (!religionMap[hd.religion]) religionMap[hd.religion] = new Set();
        religionMap[hd.religion].add(hd.date.toISOString().split('T')[0]);
    });

    // Helper to parse Hours
    const parseToHrs = (val) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes(':')) {
            const [h, m] = str.split(':').map(Number);
            return (h || 0) + ((m || 0) / 60);
        }
        return parseFloat(str) || 0;
    };

    // Process Each Employee
    for (const emp of employees) {
        // Filter attendance
        const empAtt = allAttendance.filter(a => a.employee.toString() === emp._id.toString());

        // Working Days (Present count)
        const workedDays = empAtt.filter(a => a.isPresent).length;

        // Sum Worked Hours
        const totalWorkedHrs = empAtt.reduce((sum, a) => sum + getRecordHrs(a), 0);

        // Required Hours Logic
        let offDaysCount = 0;
        const religion = emp.religion || 'Islam';
        const holidayDates = religionMap[religion] || new Set();

        // Calculate available working days in month
        // We iterate 1..DaysInMonth
        let workingDaysAvailable = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            // Create date: tMoment is mutable? No, clone it.
            // moment(date) sets date.
            const currentD = tMoment.clone().date(d);
            const isSunday = currentD.day() === 0;
            const isHoliday = holidayDates.has(currentD.format('YYYY-MM-DD'));

            if (isSunday || isHoliday) {
                offDaysCount++;
            } else {
                workingDaysAvailable++; // Potential working day
            }
        }

        let totalWdsPerMonth = workingDaysAvailable;
        if (emp.thirtyWorkingDays) totalWdsPerMonth = 30; // Override

        // Determine Duty Hours
        let dutyHours = 8;
        if (emp.totalHrs && !isNaN(parseFloat(emp.totalHrs))) {
            dutyHours = parseFloat(emp.totalHrs);
        } else if (emp.fDutyTime && emp.tDutyTime) {
            const [fH, fM] = emp.fDutyTime.split(':').map(Number);
            const [tH, tM] = emp.tDutyTime.split(':').map(Number);
            let diff = (tH * 60 + tM) - (fH * 60 + fM);
            if (diff < 0) diff += 1440;
            dutyHours = diff / 60;
        }

        const requiredHrs = totalWdsPerMonth * dutyHours;
        const diffHrs = totalWorkedHrs - requiredHrs;

        const overTime = diffHrs > 0 ? diffHrs : 0;
        const shortTime = diffHrs < 0 ? Math.abs(diffHrs) : 0;

        // Completion Percentage
        let completion = 0;
        if (requiredHrs > 0) {
            completion = (totalWorkedHrs / requiredHrs) * 100;
        } else if (totalWorkedHrs > 0) {
            completion = 100; // Worked but 0 required?
        }

        // Status Logic
        let statusText = 'Present';
        if (completion === 0 && workedDays === 0) statusText = 'Absent';
        else if (completion < 50) statusText = 'Poor'; // Just example

        // Final Status Filter Check
        if (status && status !== 'All Status' && status !== '') {
            if (status.toLowerCase() !== statusText.toLowerCase()) continue;
        }

        // Only return necessary fields
        reportData.push({
            employeeId: emp.code,
            name: emp.name,
            department: emp.department ? emp.department.name : '-',
            designation: emp.designation ? emp.designation.name : '-',
            requiredHours: Number(requiredHrs).toFixed(2),
            workedHours: Number(totalWorkedHrs).toFixed(2),
            workingDays: workedDays,
            dutyHours: Number(dutyHours).toFixed(2),
            overtime: Number(overTime).toFixed(2),
            shortHours: Number(shortTime).toFixed(2),
            completion: Number(completion).toFixed(1),
            status: statusText,
            progress: completion >= 100 ? 'GOOD' : (completion >= 80 ? 'AVG' : 'POOR')
        });
    }

    res.status(200).json({
        success: true,
        count: reportData.length,
        data: reportData
    });
});

// @desc    Get Employee Monthly Attendance (for popup modal)
// @route   GET /api/v1/hr-dashboard/employee-monthly
// @access  Private
exports.getEmployeeMonthlyAttendance = asyncHandler(async (req, res, next) => {
    const { employeeId, date } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });

    const tMoment = date ? moment(date) : moment();
    const startOfMonth = tMoment.clone().startOf('month').toDate();
    const endOfMonth = tMoment.clone().endOf('month').toDate();

    const empMonthlyCacheKey = `emp_monthly_v3_${employeeId}_${tMoment.format('YYYY-MM')}`;
    let emp = employeeCache.get(empMonthlyCacheKey + '_emp');
    if (!emp) {
        emp = await Employee.findOne({ code: employeeId })
            .select('name code branch department designation photo basicSalary totalHrs religion')
            .populate('department', 'name')
            .populate('designation', 'name')
            .lean();
        if (emp) employeeCache.set(empMonthlyCacheKey + '_emp', emp, TTL_EMPLOYEES);
    }

    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    let records = attendanceCache.get(empMonthlyCacheKey + '_att');
    if (!records) {
        records = await Attendance.find({
            employee: emp._id,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        }).select('date displayStatus checkIn checkOut totalHrs workedHrs isPresent').sort({ date: 1 }).lean();
        attendanceCache.set(empMonthlyCacheKey + '_att', records, TTL_ATTENDANCE);
    }

    // Calculation Constants
    const dutyHrs = parseFloat(emp.totalHrs) || 8;
    const basicSalary = parseFloat(emp.basicSalary) || 0;
    const hourlyRate = (dutyHrs > 0) ? (basicSalary / 30 / dutyHrs) : 0;

    const processedData = records.map(r => {
        // Calculate worked hours and day name
        const workedHrs = getRecordHrs(r);
        const dayName = moment(r.date).format('dddd');
        const isSunday = dayName === 'Sunday';

        let otHrs = 0;
        let stHrs = 0;

        if (workedHrs > dutyHrs) {
            // Overtime is any work beyond duty hours, including Sundays
            otHrs = workedHrs - dutyHrs;
        } else if (workedHrs < dutyHrs && !isSunday && workedHrs >= 0) {
            // Short time is only calculated for working days (exclude Sundays)
            stHrs = dutyHrs - workedHrs;
        }

        return {
            ...r,
            totalHrs: workedHrs,
            dutyHrs: dutyHrs,
            otHrs: Number(otHrs.toFixed(2)),
            stHrs: Number(stHrs.toFixed(2)),
            otRs: Math.round(otHrs * hourlyRate),
            stRs: Math.round(stHrs * hourlyRate)
        };
    });

    res.status(200).json({
        success: true,
        employee: {
            code: emp.code,
            name: emp.name,
            branch: emp.branch || '-',
            department: emp.department?.name || '-',
            designation: emp.designation?.name || '-',
            photo: emp.photo || null
        },
        month: tMoment.format('MMMM YYYY'),
        data: processedData
    });
});

// @desc    Get Employee Advance Ledger (for popup modal with date range)
// @route   GET /api/v1/hr-dashboard/advance-ledger
// @access  Private
exports.getEmployeeAdvanceLedger = asyncHandler(async (req, res, next) => {
    const employeeIdentifier = req.query.employeeCode || req.query.code || req.query.employeeId || req.query.employee || req.query.id || (req.user && req.user.code) || (req.employee && req.employee.code) || (req.user && req.user.id) || req.userId;
    const fromDate = req.query.fromDate || req.query.from || req.query.startDate;
    const toDate = req.query.toDate || req.query.to || req.query.endDate;

    if (!employeeIdentifier) return res.status(400).json({ success: false, message: 'employeeCode or employeeId is required' });

    let emp = null;
    if (mongoose.Types.ObjectId.isValid(employeeIdentifier)) {
        emp = await Employee.findById(employeeIdentifier)
            .select('name code branch department designation basicSalary opening')
            .populate('department', 'name')
            .populate('designation', 'name')
            .lean();
    }
    if (!emp) {
        emp = await Employee.findOne({ code: String(employeeIdentifier).trim() })
            .select('name code branch department designation basicSalary opening')
            .populate('department', 'name')
            .populate('designation', 'name')
            .lean();
    }
    if (!emp) {
        emp = await Employee.findOne({ name: new RegExp('^' + String(employeeIdentifier).trim() + '$', 'i') })
            .select('name code branch department designation basicSalary opening')
            .populate('department', 'name')
            .populate('designation', 'name')
            .lean();
    }

    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // ── Opening Balance ──────────────────────────────────────────────────────
    // Sum all advances BEFORE the selected fromDate (+ employee's initial opening field)
    let openingBalance = parseFloat(emp.opening || 0);
    if (fromDate) {
        const prePeriodAdvances = await EmployeeAdvance.find({
            $or: [
                { employee: emp._id },
                { code: emp.code }
            ],
            date: { $lt: moment(fromDate).startOf('day').toDate() }
        }).lean();

        prePeriodAdvances.forEach(a => {
            const amt = parseFloat(a.paid || 0);
            if (amt <= 0) return;
            if (a.transactionType === 'Pay') {
                openingBalance += amt;   // Advance given → increases what they owe
            } else {
                openingBalance -= amt;   // Advance recovered → reduces what they owe
            }
        });
    }

    // Build date filter for in-range transactions
    const dateFilter = {
        $or: [
            { employee: emp._id },
            { code: emp.code }
        ]
    };
    if (fromDate || toDate) {
        dateFilter.date = {};
        if (fromDate) dateFilter.date.$gte = moment(fromDate).startOf('day').toDate();
        if (toDate) dateFilter.date.$lte = moment(toDate).endOf('day').toDate();
    }

    const advances = await EmployeeAdvance.find(dateFilter).sort({ date: 1 }).lean();

    // Calculate running balance starting from the correct opening balance
    let runningBalance = openingBalance;
    let totalPay = 0;
    let totalReceived = 0;

    const ledger = advances
        .filter(a => parseFloat(a.paid || 0) > 0)   // skip zero/empty amount records
        .map(a => {
            const amt = parseFloat(a.paid || 0);
            let dr = 0, cr = 0;
            if (a.transactionType === 'Pay') {
                dr = amt;
                runningBalance += amt;
                totalPay += amt;
            } else {
                cr = amt;
                runningBalance -= amt;
                totalReceived += amt;
            }
            let displayDate = new Date(a.date);
            // If it's a payroll deduction, match the main ledger by showing it at month-end
            if (a.payroll) {
                displayDate = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0);
            }

            return {
                date: moment(displayDate).format('DD-MMM-YYYY'),
                narration: a.remarks || a.transactionType || '-', // Use remarks for description if available
                type: a.transactionType || '-',
                debit: dr,
                credit: cr,
                balance: runningBalance,
                remarks: a.remarks || '-'
            };
        });

    res.status(200).json({
        success: true,
        employee: {
            code: emp.code,
            name: emp.name,
            branch: emp.branch || '-',
            department: emp.department?.name || '-',
            designation: emp.designation?.name || '-',
            photo: emp.photo || null,
            openingBalance   // ← now reflects all transactions before fromDate
        },
        summary: {
            openingBalance,
            totalPay,
            totalDebit: totalPay,
            totalReceived,
            totalCredit: totalReceived,
            closingBalance: runningBalance
        },
        data: ledger
    });
});

// @desc    Get Employee Performance Report
// @route   GET /api/v1/hr-dashboard/performance
// @access  Private
exports.getEmployeePerformance = asyncHandler(async (req, res, next) => {
    const { date, branch, department, designation, search } = req.query;
    const tMoment = date ? moment(date) : moment();

    const startOfMonth = tMoment.clone().startOf('month').toDate();
    const endOfMonth = tMoment.clone().endOf('month').toDate();
    const daysInMonth = tMoment.daysInMonth();

    // 1. Dependency Resolution Functions
    const resolveDeptId = async (name) => {
        if (!name || name === 'Select Department' || name === 'All Depts' || name === 'All') return undefined;
        const EmployeeDepartment = require('../models/EmployeeDepartment');
        const doc = await EmployeeDepartment.findOne({ name }).select('_id').lean();
        return doc ? doc._id : null;
    };

    const resolveDesigId = async (name) => {
        if (!name || name === 'Select Designation' || name === 'All') return undefined;
        const Designation = require('../models/Designation');
        const doc = await Designation.findOne({ name }).select('_id').lean();
        return doc ? doc._id : null;
    };

    // Parallelize filter resolution
    const [dId, dgId] = await Promise.all([resolveDeptId(department), resolveDesigId(designation)]);

    const empQuery = { isActive: true, payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } };
    if (branch && !['all branches','all','select branch'].includes(String(branch).trim().toLowerCase())) empQuery.branch = branch;
    
    // Apply branch level restriction to respect user access permissions
    const restrictedEmpQuery = await applyBranchFilter(req, empQuery, Employee);
    
    if (dId !== undefined) restrictedEmpQuery.department = dId;
    if (dgId !== undefined) restrictedEmpQuery.designation = dgId;

    if (search && search.trim()) {
        const term = search.trim();
        restrictedEmpQuery.$or = [{ name: { $regex: term, $options: 'i' } }, { code: { $regex: term, $options: 'i' } }];
    }

    // 2. Ultra-Fast Parallel Fetch
    const perfCacheKey = `perf_data_${JSON.stringify(restrictedEmpQuery)}_${startOfMonth.toISOString()}`;
    const cached = employeeCache.get(perfCacheKey);
    if (cached) return res.status(200).json(cached);

    const [employees, allAttendance, holyDays, depts, desigs] = await Promise.all([
        Employee.find(restrictedEmpQuery).select('name code branch department designation fDutyTime totalHrs thirtyWorkingDays photo').lean(),
        Attendance.find({ date: { $gte: startOfMonth, $lte: endOfMonth } }).select('employee date displayStatus checkIn totalHrs workedHrs').lean(),
        HolyDay.find({ isActive: true, date: { $gte: startOfMonth, $lte: endOfMonth } }).select('date').lean(),
        require('../models/EmployeeDepartment').find().select('name').lean(),
        require('../models/Designation').find().select('name').lean()
    ]);

    // O(1) Reference Maps
    const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));
    const desigMap = Object.fromEntries(desigs.map(d => [d._id.toString(), d.name]));
    const holidayDates = new Set(holyDays.map(h => moment(h.date).format('YYYY-MM-DD')));

    // Pre-group attendance by employee for instant O(1) lookup
    const attMap = {};
    allAttendance.forEach(a => {
        const eId = a.employee.toString();
        if (!attMap[eId]) attMap[eId] = [];
        attMap[eId].push(a);
    });

    // Calc Working Days
    let totalWorkingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const curr = tMoment.clone().date(d);
        if (curr.day() !== 0 && !holidayDates.has(curr.format('YYYY-MM-DD'))) totalWorkingDays++;
    }

    // 3. Process Performance Meta-Data
    const performanceData = employees.map(emp => {
        const att = attMap[emp._id.toString()] || [];
        const daysPresent = att.filter(a => a.displayStatus === 'Present' || a.displayStatus === 'Late').length;
        const daysAbsent = att.filter(a => a.displayStatus === 'Absent').length;
        const daysLeave = att.filter(a => a.displayStatus === 'Leave').length;

        let lates = 0;
        const dutyStart = emp.fDutyTime ? moment(emp.fDutyTime, ['h:mm A', 'H:mm']) : null;
        att.forEach(a => {
            if ((a.displayStatus === 'Present' || a.displayStatus === 'Late') && a.checkIn && dutyStart) {
                const checkIn = moment(a.checkIn, ['h:mm A', 'H:mm']);
                if (checkIn.isAfter(dutyStart.clone().add(10, 'minutes'))) lates++;
            }
        });

        const attendanceRate = totalWorkingDays > 0 ? (daysPresent / totalWorkingDays) * 100 : 0;
        const punctualityRate = daysPresent > 0 ? ((daysPresent - lates) / daysPresent) * 100 : 100;
        const workedHrs = att.reduce((sum, a) => sum + getRecordHrs(a), 0);
        const dutyHrs = parseFloat(emp.totalHrs) || 8;
        const reqHrs = (emp.thirtyWorkingDays ? 30 : totalWorkingDays) * dutyHrs;
        const hoursCompletion = reqHrs > 0 ? (workedHrs / reqHrs) * 100 : 0;
        const score = (attendanceRate * 0.4) + (punctualityRate * 0.3) + (Math.min(hoursCompletion, 120) * 0.3);

        let grade = 'F';
        if (score >= 90) grade = 'A+';
        else if (score >= 80) grade = 'A';
        else if (score >= 70) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 50) grade = 'D';

        return {
            code: emp.code,
            name: emp.name,
            photo: emp.photo,
            department: deptMap[emp.department?.toString()] || '-',
            designation: desigMap[emp.designation?.toString()] || '-',
            stats: { totalWorkingDays, daysPresent, daysAbsent, daysLeave, lates, workedHrs: workedHrs.toFixed(1), reqHrs: reqHrs.toFixed(1) },
            ratings: { attendance: attendanceRate.toFixed(1), punctuality: punctualityRate.toFixed(1), completion: hoursCompletion.toFixed(1), overall: score.toFixed(1) },
            grade
        };
    });


    const result = { success: true, month: tMoment.format('MMMM YYYY'), data: performanceData };
    employeeCache.set(perfCacheKey, result, TTL_ATTENDANCE);
    res.status(200).json(result);
});

// @desc    Get all unique branches
// @route   GET /api/v1/hr-dashboard/branches
// @access  Private
exports.getBranches = asyncHandler(async (req, res, next) => {
    const branches = await Employee.distinct('branch', {
        branch: { $nin: [null, ''] },
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    });
    
    res.status(200).json({
        success: true,
        data: branches.sort()
    });
});
