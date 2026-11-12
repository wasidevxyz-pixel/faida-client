const mongoose = require('mongoose');
const Bank = require('../models/Bank');
const DailyCash = require('../models/DailyCash');
const BankTransaction = require('../models/BankTransaction');
const Department = require('../models/Department');
const EasypaisaSettlement = require('../models/EasypaisaSettlement');
const EasypaisaSettlementBatch = require('../models/EasypaisaSettlementBatch');
const asyncHandler = require('../middleware/async');

// Helper: Normalize Date to YYYY-MM-DD string
const toDateStr = (d) => {
    if (!d) return '';
    try {
        const dateObj = new Date(d);
        if (isNaN(dateObj.getTime())) return '';
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch {
        return '';
    }
};

// Helper: Generate all YYYY-MM-DD date strings between start and end (inclusive)
const getDaysArray = (startStr, endStr) => {
    const days = [];
    if (!startStr || !endStr) return days;
    const sParts = String(startStr).split('T')[0].split('-').map(Number);
    const eParts = String(endStr).split('T')[0].split('-').map(Number);
    if (sParts.length !== 3 || eParts.length !== 3) return days;
    
    let curr = new Date(Date.UTC(sParts[0], sParts[1] - 1, sParts[2]));
    const end = new Date(Date.UTC(eParts[0], eParts[1] - 1, eParts[2]));
    if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) return days;
    
    let count = 0;
    while (curr <= end && count <= 366) {
        const y = curr.getUTCFullYear();
        const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
        const d = String(curr.getUTCDate()).padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        curr.setUTCDate(curr.getUTCDate() + 1);
        count++;
    }
    return days;
};

// Helper: Normalize branch name for robust matching (e.g. '(PWD-1)' vs 'PWD-1')
const normBranch = (str) => (str ? String(str).replace(/[()]/g, '').trim().toLowerCase() : '');

// Helper: Get all system branches across models
async function getAllSystemBranches() {
    try {
        const [b1, b2, b3] = await Promise.all([
            DailyCash.distinct('branch'),
            Department.distinct('branch'),
            Bank.distinct('branch')
        ]);
        const set = new Set([...b1, ...b2, ...b3].filter(b => b && b.trim()));
        return Array.from(set).sort();
    } catch (e) {
        console.error('Error fetching system branches:', e);
        return [];
    }
}

// Helper: Get all system departments
async function getAllSystemDepartments() {
    try {
        const depts = await Department.find({ isActive: { $ne: false } }).select('name').lean();
        const set = new Set(depts.map(d => d.name ? d.name.trim() : '').filter(Boolean));
        return Array.from(set).sort();
    } catch (e) {
        console.error('Error fetching system departments:', e);
        return [];
    }
}

// @desc    Get EasyPaisa Settlement & Reconciliation Data (Summary, Department Breakdown, Details, KPIs)
// @route   GET /api/v1/easypaisa-settlement/data
exports.getSettlementData = asyncHandler(async (req, res) => {
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = today.toISOString().split('T')[0];

    const startDateStr = req.query.startDate || defaultStart;
    const endDateStr = req.query.endDate || defaultEnd;
    const branchFilter = req.query.branch && req.query.branch !== 'All Branches' ? req.query.branch.trim() : null;
    const deptFilter = req.query.department && req.query.department !== 'All Departments' ? req.query.department.trim() : null;
    const statusFilter = req.query.status || 'all'; // 'all', 'pending', 'cleared', 'discrepancy'

    const startDateTime = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDateStr}T23:59:59.999Z`);

    // 1. Resolve all Easypaisa Bank accounts configured in the system (EXCLUDING personal MED-HS)
    const epBanks = await Bank.find({
        $and: [
            {
                $or: [
                    { bankName: { $regex: /easypaisa|easy\s*paisa/i } },
                    { accountTitle: { $regex: /easypaisa|easy\s*paisa/i } }
                ]
            },
            { bankName: { $not: { $regex: /MED-HS|HS/i } } },
            { accountTitle: { $not: { $regex: /MED-HS|HS/i } } }
        ]
    })
    .populate('department', 'name')
    .select('_id bankName accountTitle accountNo branch department deduction isActive')
    .lean();

    const epBankIds = epBanks.map(b => b._id);
    const epBankNames = epBanks.map(b => b.bankName);
    const epAccountNos = epBanks.map(b => b.accountNo).filter(Boolean);

    // Resolve any excluded banks (like EASYPAISA (MED-HS))
    const excludedBanks = await Bank.find({
        $or: [
            { bankName: { $regex: /MED-HS|HS/i } },
            { accountTitle: { $regex: /MED-HS|HS/i } }
        ]
    }).select('_id').lean();
    const excludedBankIds = excludedBanks.map(b => b._id);

    // Build Branch -> EasyPaisa Departments map strictly based on EasyPaisa Bank accounts
    const branchDepartmentMap = {};      // normBranch -> Set of dept names
    const branchDepartmentMapExact = {}; // exactBranch -> Set of dept names
    const allEpDeptsSet = new Set();

    epBanks.forEach(b => {
        const rawBranch = (b.branch || '').trim();
        const nb = normBranch(rawBranch);

        let deptName = b.department?.name ? b.department.name.trim() : null;
        if (!deptName && b.bankName) {
            const m = b.bankName.match(/\(([^)]+)\)/);
            if (m) deptName = m[1].trim();
        }
        if (!deptName && b.accountTitle) {
            const cleanTitle = b.accountTitle.replace(/easypaisa|easy\s*paisa/i, '').replace(/[-–—:_()]/g, '').trim();
            if (cleanTitle) deptName = cleanTitle;
        }

        if (deptName) {
            allEpDeptsSet.add(deptName);
            if (nb) {
                if (!branchDepartmentMap[nb]) branchDepartmentMap[nb] = new Set();
                branchDepartmentMap[nb].add(deptName);
            }
            if (rawBranch) {
                if (!branchDepartmentMapExact[rawBranch]) branchDepartmentMapExact[rawBranch] = new Set();
                branchDepartmentMapExact[rawBranch].add(deptName);
            }
        }
    });

    const branchDepartmentMapOutput = {};
    for (const [k, v] of Object.entries(branchDepartmentMap)) {
        branchDepartmentMapOutput[k] = Array.from(v).sort();
    }
    for (const [k, v] of Object.entries(branchDepartmentMapExact)) {
        branchDepartmentMapOutput[k] = Array.from(v).sort();
    }

    // 2. Query DailyCash entries routing through EasyPaisa (excluding MED-HS)
    const dailyCashQuery = {
        date: { $gte: startDateTime, $lte: endDateTime },
        bank: { $in: epBankIds, $nin: excludedBankIds }
    };
    if (branchFilter) dailyCashQuery.branch = branchFilter;

    const rawDailyCash = await DailyCash.find(dailyCashQuery)
        .populate('bank', 'bankName accountTitle accountNo deduction')
        .populate('department', 'name')
        .sort({ date: -1 })
        .lean();

    // 3. Query persistent settlement records
    const settlementQuery = {
        dateString: { $gte: startDateStr, $lte: endDateStr }
    };
    if (branchFilter) settlementQuery.branch = branchFilter;

    const savedSettlements = await EasypaisaSettlement.find(settlementQuery).lean();
    const settlementMap = new Map();
    savedSettlements.forEach(s => {
        settlementMap.set(`${s.dateString}_${s.branch}`, s);
    });

    // 5. Build Atomic Detailed Items Array
    let details = [];

    // Map DailyCash slips
    rawDailyCash.forEach(dc => {
        const dStr = toDateStr(dc.date);
        const gross = parseFloat(dc.totalAmount) || 0;
        const rate = parseFloat(dc.deductedAmount) || 0;
        const deduction = Math.round((gross * rate) / 100);
        const net = gross - deduction;
        const branch = (dc.branch || 'Main').trim();
        const deptName = dc.department ? (dc.department.name || String(dc.department)) : 'General';

        // Filter by department if requested
        if (deptFilter && deptName !== deptFilter) return;

        // Check clearance status from saved settlement
        const settlement = settlementMap.get(`${dStr}_${branch}`);
        const isCleared = settlement ? settlement.status === 'cleared' : false;

        details.push({
            id: dc._id.toString(),
            source: 'DailyCash',
            date: dStr,
            fullDate: dc.date,
            branch: branch,
            slipNo: dc.slip || dc.batchNo || '—',
            batchNo: dc.batchNo || '—',
            cashierUser: dc.user || 'Counter',
            department: deptName,
            bankName: dc.bank?.bankName || dc.bankName || 'Easypaisa',
            accountNo: dc.bank?.accountNo || '—',
            grossAmount: gross,
            deductionRate: rate,
            deductionAmount: deduction,
            netAmount: net,
            status: isCleared ? 'cleared' : 'pending',
            remarks: dc.remarks || ''
        });
    });


    // 6. Aggregate Date-Wise & Branch-Wise Summary
    const groupMap = new Map();

    details.forEach(item => {
        const key = `${item.date}_${item.branch}`;
        if (!groupMap.has(key)) {
            groupMap.set(key, {
                date: item.date,
                branch: item.branch,
                systemGross: 0,
                systemDeduction: 0,
                systemNet: 0,
                trxCount: 0
            });
        }
        const g = groupMap.get(key);
        g.systemGross += item.grossAmount;
        g.systemDeduction += item.deductionAmount;
        g.systemNet += item.netAmount;
        g.trxCount += 1;
    });

    // CRITICAL: Ensure ALL dates in the requested date range are included (so days with 0 entries like 06/09/2026 appear as empty rows)
    const allRangeDates = getDaysArray(startDateStr, endDateStr);
    const targetBranches = new Set();
    if (branchFilter) {
        targetBranches.add(branchFilter);
    } else {
        // Collect branches with activity or saved settlements
        details.forEach(item => {
            if (item.branch) targetBranches.add(item.branch);
        });
        savedSettlements.forEach(s => {
            if (s.branch) targetBranches.add(s.branch);
        });
        epBanks.forEach(b => {
            if (b.branch && b.branch.trim()) targetBranches.add(b.branch.trim());
        });
    }

    // Fallback if no activity found yet
    if (targetBranches.size === 0) {
        targetBranches.add('Main');
    }

    // Populate every date in range for each target branch
    for (const br of targetBranches) {
        for (const dStr of allRangeDates) {
            const key = `${dStr}_${br}`;
            if (!groupMap.has(key)) {
                const s = settlementMap.get(key);
                groupMap.set(key, {
                    date: dStr,
                    branch: br,
                    systemGross: (s && s.status === 'cleared') ? (s.systemGross || 0) : 0,
                    systemDeduction: (s && s.status === 'cleared') ? (s.systemDeduction || 0) : 0,
                    systemNet: (s && s.status === 'cleared') ? (s.systemNet || 0) : 0,
                    trxCount: 0
                });
            }
        }
    }

    // Build the final Summary rows
    // RULE: If Salman Sb has NOT entered an amount, salmanAmount MUST BE NULL (do NOT auto-fill!)
    let summary = Array.from(groupMap.values()).map(row => {
        const key = `${row.date}_${row.branch}`;
        const settlement = settlementMap.get(key);

        const deptAmounts = settlement?.departmentAmounts || {};
        
        // Find allowed EasyPaisa departments for this row's branch
        const rowNormBranch = normBranch(row.branch);
        const allowedDepts = branchDepartmentMap[rowNormBranch] || branchDepartmentMapExact[row.branch] || null;

        let sumFromDepts = 0;
        let hasEnteredAnyDept = false;
        if (deptAmounts && typeof deptAmounts === 'object') {
            for (const [dept, amt] of Object.entries(deptAmounts)) {
                // If branch has configured EasyPaisa bank departments, only count departments configured on that branch's EasyPaisa banks
                if (allowedDepts && allowedDepts.size > 0 && !allowedDepts.has(dept)) {
                    continue;
                }
                if (amt !== '' && amt !== null && amt !== undefined && !isNaN(Number(amt))) {
                    sumFromDepts += parseFloat(amt);
                    hasEnteredAnyDept = true;
                }
            }
        }

        const hasEnteredLegacySalman = Boolean(settlement && settlement.salmanAmount !== null && settlement.salmanAmount !== undefined);
        const hasEnteredSalman = hasEnteredAnyDept || hasEnteredLegacySalman;
        const salman = hasEnteredAnyDept ? sumFromDepts : (hasEnteredLegacySalman ? parseFloat(settlement.salmanAmount) : null);
        const diff = hasEnteredSalman ? Math.round(salman - row.systemGross) : null;
        const status = settlement ? settlement.status : 'pending';

        return {
            date: row.date,
            branch: row.branch,
            systemGross: Math.round(row.systemGross),
            systemDeduction: Math.round(row.systemDeduction),
            systemNet: Math.round(row.systemNet),
            trxCount: row.trxCount,
            departmentAmounts: deptAmounts,
            salmanAmount: salman,           // null if not entered
            isTallied: hasEnteredSalman,     // false if not entered
            difference: diff,               // null if not entered
            status: status,
            clearedAt: settlement?.clearedAt || null,
            clearedBy: settlement?.clearedBy || null,
            clearedFromDate: settlement?.clearedFromDate || null,
            clearedToDate: settlement?.clearedToDate || null,
            transferRef: settlement?.transferRef || '',
            remarks: settlement?.remarks || '',
            history: settlement?.history || []
        };
    });

    // Sort summary descending by date, then branch name
    summary.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return a.branch.localeCompare(b.branch);
    });

    // Apply status filter if specified
    if (statusFilter === 'pending') {
        summary = summary.filter(s => s.status === 'pending');
        details = details.filter(d => d.status === 'pending');
    } else if (statusFilter === 'cleared') {
        summary = summary.filter(s => s.status === 'cleared');
        details = details.filter(d => d.status === 'cleared');
    } else if (statusFilter === 'discrepancy') {
        summary = summary.filter(s => s.isTallied && s.difference !== 0);
    }

    // 7. Calculate Department Breakdown (Both Summary & Detailed Date/Slip Breakdown)
    const deptRollupMap = new Map();
    let overallGross = 0;

    details.forEach(item => {
        const d = item.department || 'General';
        overallGross += item.grossAmount;

        if (!deptRollupMap.has(d)) {
            deptRollupMap.set(d, {
                department: d,
                trxCount: 0,
                grossAmount: 0,
                deductionAmount: 0,
                netAmount: 0,
                dateMap: new Map(),
                slips: []
            });
        }
        const r = deptRollupMap.get(d);
        r.trxCount += 1;
        r.grossAmount += item.grossAmount;
        r.deductionAmount += item.deductionAmount;
        r.netAmount += item.netAmount;

        // Group by Date + Branch within this department
        const dateKey = `${item.date}_${item.branch}`;
        if (!r.dateMap.has(dateKey)) {
            r.dateMap.set(dateKey, {
                date: item.date,
                branch: item.branch,
                trxCount: 0,
                grossAmount: 0,
                deductionAmount: 0,
                netAmount: 0
            });
        }
        const dGroup = r.dateMap.get(dateKey);
        dGroup.trxCount += 1;
        dGroup.grossAmount += item.grossAmount;
        dGroup.deductionAmount += item.deductionAmount;
        dGroup.netAmount += item.netAmount;

        // Keep individual slip
        r.slips.push(item);
    });

    const departmentBreakdown = Array.from(deptRollupMap.values()).map(d => ({
        department: d.department,
        trxCount: d.trxCount,
        grossAmount: Math.round(d.grossAmount),
        deductionAmount: Math.round(d.deductionAmount),
        netAmount: Math.round(d.netAmount),
        sharePercent: overallGross > 0 ? Math.round((d.grossAmount / overallGross) * 100) : 0,
        dates: Array.from(d.dateMap.values()).map(dt => ({
            ...dt,
            grossAmount: Math.round(dt.grossAmount),
            deductionAmount: Math.round(dt.deductionAmount),
            netAmount: Math.round(dt.netAmount)
        })).sort((a, b) => b.date.localeCompare(a.date)),
        slips: d.slips
    })).sort((a, b) => b.grossAmount - a.grossAmount);

    const departmentSummary = departmentBreakdown.map(({ dates, slips, ...summary }) => summary);

    // 8. Calculate Dashboard KPIs
    let totalSystemGross = 0;
    let totalSystemNet = 0;
    let totalSalmanAmount = 0;
    let talliedRowsCount = 0;
    let totalClearedAmount = 0;
    let totalPendingAmount = 0;
    let totalDiscrepancy = 0;
    let pendingDatesCount = 0;
    let clearedDatesCount = 0;
    let maxClearedDate = null;

    summary.forEach(s => {
        totalSystemGross += s.systemGross;
        totalSystemNet += s.systemNet;

        if (s.isTallied && s.salmanAmount !== null) {
            totalSalmanAmount += s.salmanAmount;
            totalDiscrepancy += s.difference;
            talliedRowsCount += 1;
        }

        if (s.status === 'cleared') {
            totalClearedAmount += s.systemGross;
            clearedDatesCount += 1;
            if (!maxClearedDate || s.date > maxClearedDate) {
                maxClearedDate = s.date;
            }
        } else {
            totalPendingAmount += s.systemGross;
            pendingDatesCount += 1;
        }
    });

    // 9. Discover ALL System Branches & Departments for Dropdowns
    const [allBranches, allDepartments] = await Promise.all([
        getAllSystemBranches(),
        getAllSystemDepartments()
    ]);

    // Resolve EasyPaisa Departments strictly according to the active branch filter & its EasyPaisa banks
    let easypaisaDepartments = [];
    if (branchFilter && branchFilter !== 'All Branches') {
        const nb = normBranch(branchFilter);
        const deptsForBranch = branchDepartmentMap[nb] || branchDepartmentMapExact[branchFilter];
        if (deptsForBranch && deptsForBranch.size > 0) {
            easypaisaDepartments = Array.from(deptsForBranch).sort();
        } else {
            const matchedBanks = epBanks.filter(b => normBranch(b.branch) === nb || (b.branch && b.branch.trim() === branchFilter));
            const directSet = new Set();
            matchedBanks.forEach(b => {
                const dName = b.department?.name ? b.department.name.trim() : null;
                if (dName) directSet.add(dName);
            });
            easypaisaDepartments = Array.from(directSet).sort();
        }
    } else {
        // "All Branches": unique departments across all configured EasyPaisa banks
        easypaisaDepartments = Array.from(allEpDeptsSet).sort();
    }

    // Fallback if no EasyPaisa bank is configured at all in the system
    if (easypaisaDepartments.length === 0 && (!branchFilter || branchFilter === 'All Branches')) {
        ['Pharmacy', 'Cosmetics', 'Grocery'].forEach(d => easypaisaDepartments.push(d));
    }

    res.status(200).json({
        success: true,
        data: {
            dateRange: { startDate: startDateStr, endDate: endDateStr },
            activeBranch: branchFilter || 'All Branches',
            activeDepartment: deptFilter || 'All Departments',
            activeStatus: statusFilter,
            kpis: {
                totalSystemGross,
                totalSystemNet,
                totalSalmanAmount,
                talliedRowsCount,
                totalDiscrepancy,
                totalClearedAmount,
                totalPendingAmount,
                pendingDatesCount,
                clearedDatesCount,
                lastClearedDate: maxClearedDate || 'None yet',
                totalTrxCount: details.length
            },
            summary,
            departmentSummary,
            departmentBreakdown,
            details,
            branches: allBranches,
            departments: allDepartments,
            easypaisaDepartments,
            branchDepartmentMap: branchDepartmentMapOutput,
            easypaisaAccounts: epBanks
        }
    });
});

// @desc    Live Clearance Preview for Boss Settle Modal
// @route   GET /api/v1/easypaisa-settlement/clearance-preview
exports.getClearancePreview = asyncHandler(async (req, res) => {
    const { fromDate, toDate, branch, department } = req.query;

    if (!fromDate || !toDate) {
        return res.status(400).json({ success: false, message: 'From Date and To Date are required.' });
    }

    const startDateTime = new Date(`${fromDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${toDate}T23:59:59.999Z`);
    const branchFilter = branch && branch !== 'All Branches' ? branch.trim() : null;
    const deptFilter = department && department !== 'All Departments' ? department.trim() : null;

    // Resolve EasyPaisa banks (excluding MED-HS)
    const epBanks = await Bank.find({
        $and: [
            { bankName: { $regex: /easypaisa|easy\s*paisa/i } },
            { bankName: { $not: { $regex: /MED-HS|HS/i } } }
        ]
    }).select('_id').lean();
    const epBankIds = epBanks.map(b => b._id);

    const dcQuery = {
        date: { $gte: startDateTime, $lte: endDateTime },
        bank: { $in: epBankIds }
    };
    if (branchFilter) dcQuery.branch = branchFilter;

    const dcItems = await DailyCash.find(dcQuery)
        .populate('department', 'name')
        .select('date branch totalAmount deductedAmount department')
        .lean();

    // Query existing settlement records
    const settlements = await EasypaisaSettlement.find({
        dateString: { $gte: fromDate, $lte: toDate },
        ...(branchFilter ? { branch: branchFilter } : {})
    }).lean();

    const settlementMap = new Map();
    settlements.forEach(s => settlementMap.set(`${s.dateString}_${s.branch}`, s));

    const dateBranchMap = new Map();
    let totalGross = 0;
    let totalDeduction = 0;

    dcItems.forEach(dc => {
        const dStr = toDateStr(dc.date);
        const br = (dc.branch || 'Main').trim();
        const dept = dc.department ? (dc.department.name || String(dc.department)) : 'General';
        if (deptFilter && dept !== deptFilter) return;

        const key = `${dStr}_${br}`;
        if (!dateBranchMap.has(key)) {
            dateBranchMap.set(key, { date: dStr, branch: br, gross: 0, count: 0 });
        }
        const g = dateBranchMap.get(key);
        const gross = parseFloat(dc.totalAmount) || 0;
        const rate = parseFloat(dc.deductedAmount) || 0;
        g.gross += gross;
        g.count += 1;
        totalGross += gross;
        totalDeduction += Math.round((gross * rate) / 100);
    });

    // Ensure all dates in range are covered in preview even if 0 entries
    const allRangeDates = getDaysArray(fromDate, toDate);
    const rangeBranches = new Set();
    if (branchFilter) {
        rangeBranches.add(branchFilter);
    } else {
        dcItems.forEach(dc => rangeBranches.add((dc.branch || 'Main').trim()));
        settlements.forEach(s => rangeBranches.add(s.branch));
    }
    for (const br of rangeBranches) {
        for (const dStr of allRangeDates) {
            const key = `${dStr}_${br}`;
            if (!dateBranchMap.has(key)) {
                dateBranchMap.set(key, { date: dStr, branch: br, gross: 0, count: 0 });
            }
        }
    }

    let totalSalman = 0;
    let untalliedDatesCount = 0;
    let pendingDatesCount = 0;
    let alreadyClearedDatesCount = 0;

    dateBranchMap.forEach((val, key) => {
        const s = settlementMap.get(key);
        if (s && s.status === 'cleared') {
            alreadyClearedDatesCount += 1;
        } else {
            pendingDatesCount += 1;
        }

        if (s && s.salmanAmount !== null && s.salmanAmount !== undefined) {
            totalSalman += s.salmanAmount;
        } else {
            untalliedDatesCount += 1;
        }
    });

    res.status(200).json({
        success: true,
        data: {
            fromDate,
            toDate,
            branch: branchFilter || 'All Branches',
            department: deptFilter || 'All Departments',
            uniqueDatesCount: dateBranchMap.size,
            pendingDatesCount,
            alreadyClearedDatesCount,
            totalSlipsCount: dcItems.length,
            totalSystemGross: Math.round(totalGross),
            totalSystemNet: Math.round(totalGross - totalDeduction),
            totalSalmanAmount: Math.round(totalSalman),
            totalDifference: Math.round(totalSalman - totalGross),
            untalliedDatesCount,
            allTallied: untalliedDatesCount === 0
        }
    });
});

// @desc    Boss Action: Clear / Settle a Date Range (With Batch Audit Record)
// @route   POST /api/v1/easypaisa-settlement/clear-range
exports.clearRange = asyncHandler(async (req, res) => {
    const { fromDate, toDate, branch, department, transferRef, remarks } = req.body;

    if (!fromDate || !toDate) {
        return res.status(400).json({ success: false, message: 'From Date and To Date are required.' });
    }

    const branchFilter = branch && branch !== 'All Branches' ? branch.trim() : null;
    const deptFilter = department && department !== 'All Departments' ? department.trim() : null;
    const bossUser = req.user?.name || 'Boss';
    const now = new Date();

    const startDateTime = new Date(`${fromDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${toDate}T23:59:59.999Z`);

    // 1. Gather all DailyCash entries in range (excluding MED-HS)
    const epBanks = await Bank.find({
        $and: [
            { bankName: { $regex: /easypaisa|easy\s*paisa/i } },
            { bankName: { $not: { $regex: /MED-HS|HS/i } } }
        ]
    }).select('_id').lean();
    const epBankIds = epBanks.map(b => b._id);

    const dcQuery = {
        date: { $gte: startDateTime, $lte: endDateTime },
        bank: { $in: epBankIds }
    };
    if (branchFilter) dcQuery.branch = branchFilter;

    const dcEntries = await DailyCash.find(dcQuery)
        .populate('department', 'name')
        .select('date branch totalAmount deductedAmount department')
        .lean();

    // Group to aggregate gross for each date + branch
    const map = new Map();
    let batchGross = 0;
    let batchNet = 0;

    dcEntries.forEach(dc => {
        const dStr = toDateStr(dc.date);
        const br = (dc.branch || 'Main').trim();
        const dept = dc.department ? (dc.department.name || String(dc.department)) : 'General';
        if (deptFilter && dept !== deptFilter) return;

        const key = `${dStr}_${br}`;
        if (!map.has(key)) {
            map.set(key, { dateStr: dStr, branch: br, gross: 0, deduction: 0 });
        }
        const g = map.get(key);
        const gross = parseFloat(dc.totalAmount) || 0;
        const rate = parseFloat(dc.deductedAmount) || 0;
        const ded = Math.round((gross * rate) / 100);
        g.gross += gross;
        g.deduction += ded;
        batchGross += gross;
        batchNet += (gross - ded);
    });

    // Ensure ALL dates in the range are in map so empty dates (0 sales) are cleared properly
    const allRangeDates = getDaysArray(fromDate, toDate);
    const rangeBranches = new Set();
    if (branchFilter) {
        rangeBranches.add(branchFilter);
    } else {
        dcEntries.forEach(dc => rangeBranches.add((dc.branch || 'Main').trim()));
        const existingSettlements = await EasypaisaSettlement.find({
            dateString: { $gte: fromDate, $lte: toDate }
        }).select('branch').lean();
        existingSettlements.forEach(s => {
            if (s.branch) rangeBranches.add(s.branch);
        });
    }

    for (const br of rangeBranches) {
        for (const dStr of allRangeDates) {
            const key = `${dStr}_${br}`;
            if (!map.has(key)) {
                map.set(key, { dateStr: dStr, branch: br, gross: 0, deduction: 0 });
            }
        }
    }

    // 2. Generate unique Batch Number
    const dateStamp = fromDate.replace(/-/g, '') + '_' + toDate.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const batchNo = `EPS-CLEAR-${dateStamp}-${randomSuffix}`;

    const clearedDateKeys = [];
    let batchSalman = 0;

    // 3. Mark each settlement record in the range as cleared
    for (const [key, val] of map.entries()) {
        const startOfDate = new Date(`${val.dateStr}T00:00:00.000Z`);
        const sysGross = Math.round(val.gross);
        const sysNet = Math.round(val.gross - val.deduction);

        clearedDateKeys.push(key);

        // Find existing record to preserve Salman Sb amount (DO NOT AUTO FILL!)
        const existing = await EasypaisaSettlement.findOne({ dateString: val.dateStr, branch: val.branch });
        const salman = existing && existing.salmanAmount !== null && existing.salmanAmount !== undefined
            ? existing.salmanAmount
            : null;
        const existingDeptAmounts = existing?.departmentAmounts || {};

        if (salman !== null) batchSalman += salman;

        await EasypaisaSettlement.findOneAndUpdate(
            { dateString: val.dateStr, branch: val.branch },
            {
                $set: {
                    date: startOfDate,
                    dateString: val.dateStr,
                    branch: val.branch,
                    systemGross: sysGross,
                    systemDeduction: val.deduction,
                    systemNet: sysNet,
                    // Keep salmanAmount and departmentAmounts as-is (do NOT auto-fill!)
                    salmanAmount: salman,
                    departmentAmounts: existingDeptAmounts,
                    difference: salman !== null ? (salman - sysGross) : null,
                    status: 'cleared',
                    clearedAt: now,
                    clearedBy: bossUser,
                    clearedFromDate: startDateTime,
                    clearedToDate: endDateTime,
                    batchId: batchNo,
                    transferRef: transferRef || '',
                    remarks: remarks || ''
                },
                $push: {
                    history: {
                        action: 'cleared_range',
                        salmanAmount: salman,
                        departmentAmounts: existingDeptAmounts,
                        systemAmount: sysGross,
                        transferRef: transferRef || '',
                        remarks: `Cleared in batch ${batchNo}. ${remarks || ''}`,
                        performedBy: bossUser,
                        timestamp: now
                    }
                }
            },
            { upsert: true, new: true }
        );
    }

    // 4. Create Master Settlement Batch Audit Record
    const batch = await EasypaisaSettlementBatch.create({
        batchNo,
        fromDate,
        toDate,
        branch: branchFilter || 'All Branches',
        department: deptFilter || 'All Departments',
        recordsCount: map.size,
        totalSystemGross: Math.round(batchGross),
        totalSystemNet: Math.round(batchNet),
        totalSalmanAmount: Math.round(batchSalman),
        totalDiscrepancy: Math.round(batchSalman - batchGross),
        transferRef: transferRef || '',
        remarks: remarks || '',
        clearedBy: bossUser,
        clearedAt: now,
        status: 'active',
        clearedDateKeys
    });

    res.status(200).json({
        success: true,
        message: `Settlement successfully cleared for ${map.size} dates (${fromDate} to ${toDate})`,
        data: batch
    });
});

// @desc    Get Boss Settlement Clearance History Audit Log
// @route   GET /api/v1/easypaisa-settlement/history
exports.getSettlementHistory = asyncHandler(async (req, res) => {
    const batches = await EasypaisaSettlementBatch.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    res.status(200).json({
        success: true,
        data: batches
    });
});

// @desc    Reopen / Rollback a Settlement Batch
// @route   POST /api/v1/easypaisa-settlement/reopen-batch
exports.reopenBatch = asyncHandler(async (req, res) => {
    const { batchNo } = req.body;

    if (!batchNo) {
        return res.status(400).json({ success: false, message: 'Batch Number is required.' });
    }

    const batch = await EasypaisaSettlementBatch.findOne({ batchNo });
    if (!batch) {
        return res.status(404).json({ success: false, message: 'Settlement batch not found.' });
    }

    const userName = req.user?.name || 'Boss';
    const now = new Date();

    // Reopen all settlement records tied to this batch
    await EasypaisaSettlement.updateMany(
        { batchId: batchNo },
        {
            $set: {
                status: 'pending',
                clearedAt: null,
                clearedBy: null,
                batchId: null
            },
            $push: {
                history: {
                    action: 'batch_reopened',
                    remarks: `Batch ${batchNo} reopened by ${userName}`,
                    performedBy: userName,
                    timestamp: now
                }
            }
        }
    );

    batch.status = 'reopened';
    await batch.save();

    res.status(200).json({
        success: true,
        message: `Settlement batch ${batchNo} has been reopened to pending status.`
    });
});

// @desc    Save Salman Sb Tally Amount & Notes (CRITICAL: Do NOT auto fill if empty!)
// @route   POST /api/v1/easypaisa-settlement/save-tally
exports.saveTally = asyncHandler(async (req, res) => {
    const { date, branch, salmanAmount, departmentAmounts, remarks } = req.body;

    if (!date || !branch) {
        return res.status(400).json({ success: false, message: 'Date and Branch are required.' });
    }

    const dateStr = toDateStr(date);
    const cleanBranch = branch.trim();

    // Clean department amounts object
    let cleanDeptAmounts = {};
    let sumFromDepts = 0;
    let hasAnyDeptValue = false;

    if (departmentAmounts && typeof departmentAmounts === 'object') {
        for (const [dept, amt] of Object.entries(departmentAmounts)) {
            if (amt !== '' && amt !== null && amt !== undefined && !isNaN(Number(amt))) {
                const num = parseFloat(amt);
                cleanDeptAmounts[dept] = num;
                sumFromDepts += num;
                hasAnyDeptValue = true;
            }
        }
    }

    // If department amounts entered, salmanAmount is the exact sum of departments
    // Otherwise fallback to passed salmanAmount if present
    let parsedSalman = null;
    if (hasAnyDeptValue) {
        parsedSalman = sumFromDepts;
    } else if (salmanAmount !== '' && salmanAmount !== null && salmanAmount !== undefined && !isNaN(Number(salmanAmount))) {
        parsedSalman = parseFloat(salmanAmount);
    }

    // 1. Recalculate live system amount from DB for this exact date & branch
    const startDateTime = new Date(`${dateStr}T00:00:00.000Z`);
    const endDateTime = new Date(`${dateStr}T23:59:59.999Z`);

    const epBanks = await Bank.find({
        $and: [
            { bankName: { $regex: /easypaisa|easy\s*paisa/i } },
            { bankName: { $not: { $regex: /MED-HS|HS/i } } }
        ]
    }).select('_id').lean();
    const epBankIds = epBanks.map(b => b._id);

    const dcItems = await DailyCash.find({
        date: { $gte: startDateTime, $lte: endDateTime },
        branch: cleanBranch,
        bank: { $in: epBankIds }
    }).select('totalAmount deductedAmount').lean();

    let systemGross = 0;
    let systemDeduction = 0;
    dcItems.forEach(item => {
        const g = parseFloat(item.totalAmount) || 0;
        const r = parseFloat(item.deductedAmount) || 0;
        const d = Math.round((g * r) / 100);
        systemGross += g;
        systemDeduction += d;
    });

    const systemNet = systemGross - systemDeduction;
    const diff = parsedSalman !== null ? Math.round(parsedSalman - systemGross) : null;

    // 2. Upsert persistent settlement document
    const updated = await EasypaisaSettlement.findOneAndUpdate(
        { dateString: dateStr, branch: cleanBranch },
        {
            $set: {
                date: startDateTime,
                dateString: dateStr,
                branch: cleanBranch,
                systemGross: Math.round(systemGross),
                systemDeduction: Math.round(systemDeduction),
                systemNet: Math.round(systemNet),
                departmentAmounts: cleanDeptAmounts,
                salmanAmount: parsedSalman, // null if empty
                difference: diff,           // null if empty
                remarks: remarks !== undefined ? remarks : '',
                lastUpdatedBy: req.user?.name || 'User'
            },
            $push: {
                history: {
                    action: 'tally_saved',
                    departmentAmounts: cleanDeptAmounts,
                    salmanAmount: parsedSalman,
                    systemAmount: Math.round(systemGross),
                    difference: diff,
                    remarks: remarks || '',
                    performedBy: req.user?.name || 'User',
                    timestamp: new Date()
                }
            }
        },
        { upsert: true, new: true }
    );

    res.status(200).json({
        success: true,
        message: 'Salman Sb tally saved successfully',
        data: updated
    });
});

// @desc    Reopen a Single Date & Branch to Pending
// @route   POST /api/v1/easypaisa-settlement/reopen-date
exports.reopenDate = asyncHandler(async (req, res) => {
    const { date, branch, remarks } = req.body;

    if (!date || !branch) {
        return res.status(400).json({ success: false, message: 'Date and Branch are required.' });
    }

    const dateStr = toDateStr(date);
    const cleanBranch = branch.trim();
    const userName = req.user?.name || 'User';

    const updated = await EasypaisaSettlement.findOneAndUpdate(
        { dateString: dateStr, branch: cleanBranch },
        {
            $set: {
                status: 'pending',
                clearedAt: null,
                clearedBy: null,
                batchId: null,
                remarks: remarks || ''
            },
            $push: {
                history: {
                    action: 'date_reopened',
                    remarks: remarks || 'Reopened by user',
                    performedBy: userName,
                    timestamp: new Date()
                }
            }
        },
        { new: true }
    );

    res.status(200).json({
        success: true,
        message: `Settlement for ${dateStr} (${cleanBranch}) has been reopened to pending.`,
        data: updated
    });
});

// @desc    Unclear / Reopen a Date Range to Pending
// @route   POST /api/v1/easypaisa-settlement/unclear-range
exports.unclearRange = asyncHandler(async (req, res) => {
    const { fromDate, toDate, branch, remarks } = req.body;

    if (!fromDate || !toDate) {
        return res.status(400).json({ success: false, message: 'From Date and To Date are required.' });
    }

    const branchFilter = branch && branch !== 'All Branches' ? branch.trim() : null;
    const userName = req.user?.name || 'User';

    const query = {
        dateString: { $gte: fromDate, $lte: toDate },
        status: 'cleared'
    };
    if (branchFilter) query.branch = branchFilter;

    const result = await EasypaisaSettlement.updateMany(
        query,
        {
            $set: {
                status: 'pending',
                clearedAt: null,
                clearedBy: null,
                batchId: null,
                remarks: remarks ? `Uncleared: ${remarks}` : 'Uncleared by user'
            },
            $push: {
                history: {
                    action: 'range_uncleared',
                    remarks: remarks || `Date range ${fromDate} to ${toDate} uncleared by ${userName}`,
                    performedBy: userName,
                    timestamp: new Date()
                }
            }
        }
    );

    res.status(200).json({
        success: true,
        message: `Successfully uncleared ${result.modifiedCount} settlement date(s) back to Pending.`,
        data: { modifiedCount: result.modifiedCount }
    });
});

