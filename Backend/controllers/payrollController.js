const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdvanceInstallmentPlan = require('../models/EmployeeAdvanceInstallmentPlan');
const EmployeePenalty = require('../models/EmployeePenalty');
const HolyDay = require('../models/HolyDay');
const Store = require('../models/Store');
const EmployeeCommission = require('../models/EmployeeCommission');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const { recalculateAdvanceBalances } = require('./employeeAdvanceController');
const { recalculateEmployeeLedger } = require('./employeeLedgerController');
const xlsx = require('xlsx');

// @desc    Get all payrolls
exports.getPayrolls = async (req, res) => {
    try {
        const { monthYear, branch, employee, fromMonth, toMonth, code } = req.query;
        let query = {};
        if (monthYear) query.monthYear = monthYear;
        if (fromMonth && toMonth) query.monthYear = { $gte: fromMonth, $lte: toMonth };
        else if (fromMonth) query.monthYear = { $gte: fromMonth };
        else if (toMonth) query.monthYear = { $lte: toMonth };
        // Pass branch as a plain string so applyBranchFilter can validate access correctly.
        // (If we pass a regex object, String(query.branch) = "[object Object]" and it breaks.)
        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            query.branch = branch.toString().trim(); // plain string for security check
        }

        // Apply branch-level restriction to respect user access permissions
        const { applyBranchFilter } = require('../middleware/auth');
        query = await applyBranchFilter(req, query, Payroll);

        // NOW apply flexible regex (handles both "(PWD-1)" and "PWD-1" stored formats)
        // Only if branch wasn't blocked by applyBranchFilter
        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            if (query.branch !== '__NOT_ALLOWED_BRANCH__' && !Array.isArray(query.branch?.$in)) {
                const stripped = branch.toString().trim().replace(/^\(|\)$/g, '');
                const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.branch = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
            }
        }


        if (req.query.department && req.query.department !== 'null') query.department = req.query.department;
        if (employee) query.employee = employee;
        if (code) query.code = new RegExp(code, 'i');

        // STRICT FILTER: Hide Import-Only payrolls unless explicitly requested.
        // This blocks BOTH IMP- employee codes AND any payroll stamped isImportOnly=true
        // (which covers real employees whose payroll was updated via Excel import).
        if (req.query.includeImportOnly !== 'true') {
            query.code = { ...query.code, $not: /^IMP-/i };
            query.isImportOnly = { $ne: true };
        }

        const limit = Math.min(parseInt(req.query.limit) || 50000, 50000);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;
        const [payrolls, totalCount] = await Promise.all([
            Payroll.find(query)
                .populate({
                    path: 'employee',
                    select: 'name code department designation',
                    populate: [
                        { path: 'department', select: 'name' },
                        { path: 'designation', select: 'name' }
                    ]
                })
                .populate('createdBy', 'name')
                .sort('-monthYear -createdAt')
                .skip(skip)
                .limit(limit)
                .lean(),
            Payroll.countDocuments(query)
        ]);

        // Calculate actual attendance from Attendance model for the branch/month
        let totalAttendance = 0;
        if (monthYear && branch && branch !== 'all' && branch !== 'null') {
            const [year, month] = monthYear.split('-').map(Number);
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59);

            const attendanceStats = await Attendance.aggregate([
                {
                    $match: {
                        branch: { $regex: new RegExp(`^\\s*${branch.toString().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') },
                        date: { $gte: start, $lte: end },
                        displayStatus: 'Present'
                    }
                },
                { $count: "total" }
            ]);
            totalAttendance = attendanceStats.length > 0 ? attendanceStats[0].total : 0;
        }

        res.status(200).json({
            success: true,
            count: payrolls.length,
            totalCount,
            totalAttendance,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            data: payrolls
        });


    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// @desc    Get single payroll
exports.getPayroll = async (req, res) => {
    try {
        const p = await Payroll.findById(req.params.id)
            .populate('employee', 'name code department designation')
            .populate('createdBy', 'name')
            .lean();
        if (!p) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: p });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const excelSerialToMonthYear = (serial) => {
    if (!serial) return null;
    if (typeof serial === 'number') {
        const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
        const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0');
        if (y > 2000 && y < 2100) return `${y}-${m}`;
    }
    if (serial instanceof Date) {
        const y = serial.getFullYear(), m = String(serial.getMonth() + 1).padStart(2, '0');
        if (y > 2000 && y < 2100) return `${y}-${m}`;
    }
    const str = String(serial).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
    return null;
};

// @desc    Import payroll from Excel
exports.importPayroll = async (req, res) => {
    try {
        if (!req.files || !req.files.file) return res.status(400).json({ success: false, message: 'Upload file please.' });
        const workbook = xlsx.read(req.files.file.data, { type: 'buffer' });

        let allRowsRaw = [];
        for (const sn of workbook.SheetNames) {
            const sheet = workbook.Sheets[sn];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            const cleanRows = data.filter(r => r && r.length > 5 && r.some(c => c !== null && c !== undefined && c !== ''));
            if (cleanRows.length > 0) { allRowsRaw = cleanRows; break; }
        }

        if (allRowsRaw.length === 0) return res.status(400).json({ success: false, message: 'No data found in any sheet.' });

        const heads = allRowsRaw[0].map(h => String(h || '').trim().toUpperCase().replace(/[._\s]/g, ''));
        const dataRows = allRowsRaw.slice(1);

        // Pre-load all necessary mappings to avoid DB hits in loop
        const [allEmp, allDeps, allDesigs] = await Promise.all([
            Employee.find({}).populate('department designation').lean(),
            EmployeeDepartment.find({}).lean(),
            Designation.find({}).lean()
        ]);

        const eMap = {}, dMap = {}, dsMap = {};
        allDeps.forEach(d => { dMap[(d.name || '').trim().toUpperCase()] = d._id; });
        allDesigs.forEach(ds => { dsMap[(ds.name || '').trim().toUpperCase()] = ds._id; });

        // Helper to generate a composite key for employee matching
        const getEmpKey = (name, branch, depName, desigName) => {
            return `${String(name || '').trim().toUpperCase()}|${String(branch || '').trim().toUpperCase()}|${String(depName || '').trim().toUpperCase()}|${String(desigName || '').trim().toUpperCase()}`;
        };

        allEmp.forEach(e => { 
            const k = getEmpKey(
                e.name, 
                e.branch, 
                e.department?.name || '', 
                e.designation?.name || ''
            );
            eMap[k] = e; 
        });

        // Identify all unique Departments/Designations/Employees across the entire file
        const uniqueDeps = new Set(), uniqueDesigs = new Set(), uniqueEmpKeys = new Set();
        dataRows.forEach(r => {
            const getVal = (idx, key) => { const hIdx = heads.indexOf(key.toUpperCase().replace(/[._\s]/g, '')); return hIdx !== -1 ? r[hIdx] : r[idx]; };
            const dep = String(getVal(3, 'Department') || '').trim();
            const ds = String(getVal(5, 'Designation') || '').trim();
            const branch = String(getVal(4, 'Branch') || '').trim();
            const name = String(getVal(2, 'Employee') || '').trim();
            
            if (dep) uniqueDeps.add(dep);
            if (ds) uniqueDesigs.add(ds);
            if (name) uniqueEmpKeys.add(getEmpKey(name, branch, dep, ds));
        });

        // 1. Bulk Ensure Departments and Designations Exist
        const missingDeps = [...uniqueDeps].filter(n => !dMap[n.toUpperCase()]);
        if (missingDeps.length > 0) {
            const created = await EmployeeDepartment.insertMany(missingDeps.map(name => ({ name: name.trim() })), { ordered: false }).catch(err => err.insertedDocs || []);
            created.forEach(d => { dMap[d.name.toUpperCase()] = d._id; });
        }
        const missingDesigs = [...uniqueDesigs].filter(n => !dsMap[n.toUpperCase()]);
        if (missingDesigs.length > 0) {
            const created = await Designation.insertMany(missingDesigs.map(name => ({ name: name.trim() })), { ordered: false }).catch(err => err.insertedDocs || []);
            created.forEach(ds => { dsMap[ds.name.toUpperCase()] = ds._id; });
        }

        // Determine next sequence for auto-created codes - be strictly robust
        let nextCodeNum = 90000;
        const allImpEmps = await Employee.find({ code: /^IMP-/ }, 'code').lean();
        const existingImpCodes = new Set(allImpEmps.map(e => e.code));
        
        while (existingImpCodes.has(`IMP-${nextCodeNum}`)) { nextCodeNum++; }

        // 2. Identify and Bulk Create New Employees
        const missingEmps = [...uniqueEmpKeys].filter(k => !eMap[k]);
        if (missingEmps.length > 0) {
            const newEmpDocs = missingEmps.map(key => {
                const [name, branch, depName, desigName] = key.split('|');
                let code = `IMP-${nextCodeNum++}`;
                while (existingImpCodes.has(code)) { code = `IMP-${nextCodeNum++}`; }
                return {
                    name, code, branch,
                    department: dMap[depName],
                    designation: dsMap[desigName],
                    isActive: true,
                    payrollImportOnly: true
                };
            });

            let created = [];
            try {
                created = await Employee.insertMany(newEmpDocs, { ordered: false });
            } catch (err) {
                // ordered: false still throws if ANY fail, but we can get successful ones
                if (err.insertedDocs) created = err.insertedDocs;
                else throw err; 
            }

            created.forEach(e => {
                const k = missingEmps.find(mk => {
                    const [n, b, d, ds] = mk.split('|');
                    return n === e.name.toUpperCase() && b === e.branch.toUpperCase();
                });
                if (k) eMap[k] = e;
            });
            autoCreated = created.length;
        }

        // Helper to find name by ID (used for re-mapping)
        function findNameById(list, id) {
            const item = list.find(x => x._id && x._id.toString() === id.toString());
            return item ? item.name : '';
        }

        function depNameFromId(id) { return findNameById(allDeps, id); }
        function desigNameFromId(id) { return findNameById(allDesigs, id); }

        // 3. Prepare Payroll Bulk Operations
        const payrollOps = [];
        let invalid = 0, errors = [];

        for (let i = 0; i < dataRows.length; i++) {
            const r = dataRows[i];
            const getVal = (idx, key) => {
                const hIdx = heads.indexOf(key.toUpperCase().replace(/[._\s]/g, ''));
                return hIdx !== -1 ? r[hIdx] : r[idx];
            };

            try {
                const name = String(getVal(2, 'Employee') || '').trim();
                const dDate = getVal(1, 'Date');
                const branch = String(getVal(4, 'Branch') || '').trim();
                const mY = excelSerialToMonthYear(dDate);

                if (!name || !mY) { invalid++; continue; }

                const depName = String(getVal(3, 'Department') || '').trim();
                const dsName = String(getVal(5, 'Designation') || '').trim();
                const empKey = getEmpKey(name, branch, depName, dsName);
                const emp = eMap[empKey];

                if (!emp) { invalid++; continue; }

                const payload = {
                    employee: emp._id, 
                    monthYear: mY, 
                    branch: branch || emp.branch, 
                    code: emp.code,
                    department: depName || (emp.department?.name || ''),
                    designation: dsName || (emp.designation?.name || ''),
                    perMonth: parseFloat(getVal(6, 'BasicSalary')) || 0,
                    overTime: parseFloat(getVal(7, 'OverTime')) || 0,
                    monthlyComm: parseFloat(getVal(8, 'Commission')) || 0,
                    natin: parseFloat(getVal(9, 'FixAllowance')) || 0,
                    otherAllow: parseFloat(getVal(10, 'OtherAllowance')) || 0,
                    stLateAllow: parseFloat(getVal(11, 'STAllowance')) || 0,
                    grossTotal: parseFloat(getVal(12, 'GrossTotal')) || 0,
                    shortWeek: parseFloat(getVal(13, 'ShortTime')) || 0,
                    pAAdv: parseFloat(getVal(14, 'PreAdvance')) || 0,
                    csMale: parseFloat(getVal(15, 'CurrentAdvance')) || 0,
                    totalAdv: parseFloat(getVal(16, 'AdvanceDeduction')) || 0,
                    wht: parseFloat(getVal(17, 'WHT')) || 0,
                    netTotal: parseFloat(getVal(18, 'NetTotal')) || 0,
                    createdBy: req.user._id,
                    remarks: `Bulk Import Row ${i + 2}`,
                    // ⚠️ CRITICAL: Mark ALL imported records as import-only.
                    // This ensures they NEVER affect advance ledger or employee ledger,
                    // even when the matched employee is a real (non-IMP-) employee.
                    isImportOnly: true
                };

                // Ensure netTotal is correctly reduced by WHT if it wasn't already
                if (payload.wht > 0 && (payload.netTotal > (payload.grossTotal - payload.totalAdv - payload.shortWeek - payload.wht))) {
                    payload.netTotal = payload.grossTotal - payload.totalAdv - payload.shortWeek - payload.wht;
                }

                if (!payload.grossTotal) {
                    payload.grossTotal = payload.perMonth + payload.overTime + payload.monthlyComm + payload.natin + payload.otherAllow + payload.stLateAllow;
                }

                payrollOps.push({
                    updateOne: {
                        filter: { employee: emp._id, monthYear: mY },
                        update: { $set: payload },
                        upsert: true
                    }
                });
            } catch (err) {
                errors.push(`Row ${i + 2}: ${err.message}`);
                if (errors.length > 50) break;
            }
        }

        // 4. Execute Bulk Write
        let imported = 0, duplicates = 0;
        if (payrollOps.length > 0) {
            // Processing in chunks of 5000 to avoid BSON size limits or timeouts
            const chunkSize = 5000;
            for (let i = 0; i < payrollOps.length; i += chunkSize) {
                const chunk = payrollOps.slice(i, i + chunkSize);
                const result = await Payroll.bulkWrite(chunk, { ordered: false });
                imported += (result.upsertedCount || 0);
                duplicates += (result.matchedCount || 0);
            }

            // After bulk write, sync all affected advance ledgers
            // Use the employee/monthYear pairs from our original prepared payrollOps
            const affected = payrollOps.map(op => ({
                employee: op.updateOne.filter.employee,
                monthYear: op.updateOne.filter.monthYear
            }));

            // Process sync in parallel for better performance
            await Promise.all(affected.map(async (item) => {
                const currentPayroll = await Payroll.findOne({ 
                    employee: item.employee, 
                    monthYear: item.monthYear 
                }).select('_id totalAdv employee monthYear branch code').lean();
                
                if (currentPayroll) {
                    await syncPayrollAdvanceLedger(currentPayroll, req.user._id);
                }
            }));
        }
        res.status(200).json({ success: true, imported, duplicates, autoCreated, invalid, errors: errors.slice(0, 50) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.exportPayrolls = async (req, res) => {
    try {
        const { fromMonth, toMonth, branch, department } = req.query;
        let query = {};
        if (fromMonth && toMonth) query.monthYear = { $gte: fromMonth, $lte: toMonth };
        if (branch && branch !== 'all' && branch !== '') query.branch = { $regex: new RegExp(`^\\s*${branch.toString().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') };
        if (department && department !== 'all') query.department = department;
        const p = await Payroll.find(query).populate('employee', 'name code').lean();
        const data = p.map(x => ({
            'Payroll ID': x.payrollId || x._id.toString().slice(-5).toUpperCase(), 
            'Month': x.monthYear, 
            'Employee': x.employee?.name || 'Unknown', 
            'Branch': x.branch || '-',
            'Basic': x.perMonth || 0, 
            'OT': x.overTime || 0, 
            'Comm': x.monthlyComm || 0, 
            'Fix. Allow': x.natin || 0,
            'Other Allow': x.otherAllow || 0,
            'Gross': x.grossTotal || 0, 
            'Pre Advance': x.pAAdv || 0,
            'Curr Advance': x.csMale || 0,
            'Deduction': x.totalAdv || 0,
            'Balance': (x.pAAdv || 0) + (x.csMale || 0) - (x.totalAdv || 0),
            'Net': x.netTotal || 0
        }));
        const wb = xlsx.utils.book_new(), ws = xlsx.utils.json_to_sheet(data); xlsx.utils.book_append_sheet(wb, ws, 'Data');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Payroll_Export.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.send(buf);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getPayrollReport = async (req, res) => {
    try {
        const { fromMonth, toMonth, branch, department } = req.query;
        let match = {};
        if (fromMonth && toMonth) match.monthYear = { $gte: fromMonth, $lte: toMonth };
        if (branch && branch !== 'all' && branch !== '') match.branch = { $regex: new RegExp(`^\\s*${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') };
        if (department && department !== 'all') match.department = department;
        
        // Hide Import Only employees from aggregated reports
        match.code = { $not: /^IMP-/i };
        match.payrollImportOnly = { $ne: true };
        const stats = await Payroll.aggregate([
            { $match: match },
            { $group: { 
                _id: { branch: '$branch', department: '$department' }, 
                employeeCount: { $sum: 1 }, 
                totalBasic: { $sum: '$perMonth' }, 
                totalOT: { $sum: '$overTime' }, 
                totalComm: { $sum: '$monthlyComm' }, 
                totalUGComm: { $sum: '$ugComm' },
                totalWHComm: { $sum: '$warehouseComm' },
                totalTea: { $sum: '$teaAllowance' },
                totalRent: { $sum: '$rent' },
                totalNatin: { $sum: '$natin' },
                totalSTAllow: { $sum: '$stLateAllow' },
                totalOther: { $sum: '$otherAllow' },
                totalGross: { $sum: '$grossTotal' }, 
                totalAdv: { $sum: '$totalAdv' },
                totalNet: { $sum: '$netTotal' } 
            } },
            { $sort: { '_id.branch': 1, '_id.department': 1 } }
        ]);
        res.status(200).json({ success: true, data: stats });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.calculatePayroll = async (req, res) => {
    try {
        const { employeeId, monthYear, branch } = req.body;
        const employee = await Employee.findById(employeeId).populate('department designation').lean();
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        
        const [year, month] = monthYear.split('-').map(Number);
        const totalDays = new Date(year, month, 0).getDate();
        const is30DayBasis = (req.body.thirtyWorkingDays === true || req.body.thirtyWorkingDays === 'true' || employee.thirtyWorkingDays === true);
        const divisor = is30DayBasis ? 30 : totalDays;
        
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        
        const [attendance, allAdvances, penalties, commissionDocs, holydays] = await Promise.all([
            Attendance.find({ employee: employeeId, date: { $gte: startDate, $lte: endDate } }).lean(),
            EmployeeAdvance.find({ employee: employeeId }).lean(),
            EmployeePenalty.find({ employee: employeeId, date: { $gte: startDate, $lte: endDate } }).lean(),
            EmployeeCommission.find({ monthYear, 'data.id': employeeId.toString() }).lean(),
            HolyDay.find({ date: { $gte: startDate, $lte: endDate } }).lean()
        ]);

        // Calculate Total Working Days (Expected)
        const offDayName = (employee.offDay || 'Sunday').trim();
        const empReligion = (employee.religion || 'Islam').toLowerCase();
        
        let expectedWDs = 0;
        for (let d = 1; d <= totalDays; d++) {
            const date = new Date(year, month - 1, d);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
            
            // It's a working day if it's NOT the off day AND NOT a holiday for this employee
            const isHoliday = holydays.some(h => {
                const hDate = new Date(h.date).toDateString();
                const dDate = date.toDateString();
                const hReligion = (h.religion || 'All').toLowerCase();
                
                return hDate === dDate && (hReligion === 'all' || hReligion === empReligion);
            });
            
            if (dayName !== offDayName && !isHoliday) {
                expectedWDs++;
            }
        }
        
        const totalWdsPerMonth = is30DayBasis ? 30 : expectedWDs;
        const totalAbsents = new Set(attendance.filter(a => a.displayStatus === 'Absent').map(a => new Date(a.date).toDateString())).size;
        const allowedLeaves = totalDays - totalWdsPerMonth;

        const dutyHrs = parseInt(employee.totalHrs) || 8;
        const totalHrsMonthReg = totalWdsPerMonth * dutyHrs;
        // Helper: parse time string to minutes (treats 00:00 midnight as 1440 when isMidnight=true)
        const timeStrToMins = (val, isMidnightAllowed = false) => {
            if (!val) return 0;
            const str = String(val).trim().toUpperCase();
            if (['-', '--:--', ''].includes(str)) return 0;
            const ampm = str.match(/^(\d+):(\d+)\s*(AM|PM)$/);
            if (ampm) {
                let h = parseInt(ampm[1]);
                const m = parseInt(ampm[2]);
                if (ampm[3] === 'PM' && h < 12) h += 12;
                if (ampm[3] === 'AM' && h === 12) h = 0;
                const result = h * 60 + m;
                if (result === 0 && isMidnightAllowed) return 1440;
                return result;
            }
            if (str.includes(':')) {
                const parts = str.split(':').map(Number);
                const result = (parts[0] || 0) * 60 + (parts[1] || 0);
                if (result === 0 && isMidnightAllowed) return 1440;
                return result;
            }
            return 0;
        };

        // ══════════════════════════════════════════════════════════════════════════════
        // ⚠️  DO NOT CHANGE THIS BLOCK — FIXED ON 2026-04-07 (Conversation e5071920)
        // ══════════════════════════════════════════════════════════════════════════════
        // ROOT CAUSE OF OLD BUG: Payroll was reading stale stored fields (totalHrs /
        // workedHrs) that biometric sync never updates (it uses findOneAndUpdate which
        // bypasses Mongoose pre-save hooks). This caused payroll ≠ attendance register.
        //
        // THE FIX: Payroll ALWAYS recomputes from raw checkIn/checkOut — the exact same
        // fields the Attendance Register reads — using the exact same formula:
        //   finalHrs = (checkOut - checkIn) - breakTime ± timeDiff
        //
        // ⛔ IF YOU ARE AN AI OR DEVELOPER — DO NOT:
        //   • Revert this to reading totalHrs or workedHrs from DB (they can be stale)
        //   • Remove the break or timeDiff steps (attendance register uses them too)
        //   • Add a "Priority 2" that reads stored workedHrs when checkOut is missing
        //     (attendance register shows 0 for those rows — payroll must match)
        //
        // ✅ The only safe fallback is totalHrs for truly legacy records with NO
        //    checkIn/checkOut at all (last block of this reduce). Keep it that way.
        // ══════════════════════════════════════════════════════════════════════════════
        const workedHrsTotal = attendance.reduce((sum, a) => {
            // Always skip absent records — they should never contribute hours
            if (a.displayStatus === 'Absent') return sum;

            // ─── PRIMARY: Match Attendance Register formula EXACTLY ───────────────────────
            // The Attendance Register only shows hours for rows where BOTH checkIn AND
            // checkOut are present. It shows: gross(checkOut-checkIn) - breakTime ± timeDiff.
            // Payroll MUST use the same formula so both screens always agree.
            if (a.checkIn && a.checkOut && a.displayStatus === 'Present' &&
                !['', '-', '--:--'].includes(String(a.checkIn).trim()) &&
                !['', '-', '--:--'].includes(String(a.checkOut).trim())) {

                const inMin  = timeStrToMins(a.checkIn, false);
                const outMin = timeStrToMins(a.checkOut, true); // treat midnight 00:00 as 1440

                if (outMin > 0) {
                    let grossMins = outMin - inMin;
                    if (grossMins < 0) grossMins += 1440; // overnight shift

                    // ── Step 1: subtract break time (matches attendance register break calc) ──
                    let breakMins = 0;
                    const bOutVal = String(a.breakOut || '').trim();
                    const bInVal  = String(a.breakIn  || '').trim();
                    if (bOutVal && bInVal &&
                        !['', '-', '--:--'].includes(bOutVal) &&
                        !['', '-', '--:--'].includes(bInVal)) {
                        const bOutMin = timeStrToMins(a.breakOut, false);
                        const bInMin  = timeStrToMins(a.breakIn,  false);
                        if (bOutMin > 0 && bInMin > 0) {
                            breakMins = bInMin - bOutMin; // duration = breakIn − breakOut
                            if (breakMins < 0) breakMins += 1440;
                            if (breakMins < 0) breakMins = 0;
                        }
                    }

                    let netMins = grossMins - breakMins;
                    if (netMins < 0) netMins = 0;

                    // ── Step 2: apply time diff (matches attendance register diff calc) ───────
                    let diffMins = 0;
                    const dInVal  = String(a.timeDiffIn  || '').trim();
                    const dOutVal = String(a.timeDiffOut || '').trim();
                    if (dInVal && dOutVal &&
                        !['', '-', '--:--'].includes(dInVal) &&
                        !['', '-', '--:--'].includes(dOutVal)) {
                        const dInMin  = timeStrToMins(a.timeDiffIn,  false);
                        const dOutMin = timeStrToMins(a.timeDiffOut, false);
                        if (dOutMin > 0 || dInMin > 0) {
                            diffMins = dOutMin - dInMin; // duration = diffOut − diffIn
                            if (diffMins < 0) diffMins += 1440;
                            if (diffMins < 0) diffMins = 0;
                        }
                    }

                    const mode = a.diffMode || '+';
                    let finalMins = netMins;
                    if (mode === '+') finalMins += diffMins;
                    else if (mode === '-') finalMins -= diffMins;
                    if (finalMins < 0) finalMins = 0;

                    const hrs = finalMins / 60;
                    if (hrs > 0 && hrs < 24) return sum + hrs; // sanity: max 24h/day
                }
            }

            // ─── FALLBACK: Legacy records with no checkIn/checkOut stored ────────────────
            // Only use stored totalHrs (the net value saved from the UI) when there is
            // genuinely no checkIn/checkOut to compute from. NOTE: We intentionally do NOT
            // fall back to workedHrs (gross string) here because the attendance register
            // shows 0/empty for rows that lack checkOut, so using stored workedHrs would
            // introduce a mismatch.
            const missingCheckIO = !a.checkIn || !a.checkOut ||
                ['', '-', '--:--'].includes(String(a.checkIn).trim()) ||
                ['', '-', '--:--'].includes(String(a.checkOut).trim());

            if (missingCheckIO && a.totalHrs && a.totalHrs > 0 && a.displayStatus === 'Present') {
                return sum + a.totalHrs;
            }

            return sum;
        }, 0);
        const workedDays = new Set(attendance.filter(a => {
            if (a.displayStatus === 'Absent') return false;
            // Check checkIn/checkOut first (most reliable), then fall back to stored fields
            const hasCheckInOut = a.checkIn && a.checkOut &&
                !['', '-', '--:--'].includes(String(a.checkIn).trim()) &&
                !['', '-', '--:--'].includes(String(a.checkOut).trim());
            const hasHrs = (parseFloat(a.totalHrs) || 0) > 0;
            const isMarkedPresent = (a.isPresent && (a.displayStatus === 'Present' || a.displayStatus === 'P' || a.displayStatus === 'Half Day'));
            return hasCheckInOut || hasHrs || isMarkedPresent;
        }).map(a => new Date(a.date).toDateString())).size;

        if (process.env.NODE_ENV === 'development') {
            console.log(`CalculatePayroll [${employee.name}]: Attendance Array: ${attendance.length}, Unique WorkedDays: ${workedDays}, Unique Absents: ${totalAbsents}`);
        }

        // Calculate Previous and Current Month Advance Balances
        let pmAdv = 0;
        let cmAdv = 0;
        let pmAdvRecDefault = 0;
        let cmAdvRecDefault = 0;

        // Sort all advances by date to get chronological order
        const sortedAdvs = allAdvances.sort((a, b) => new Date(a.date) - new Date(b.date));

        sortedAdvs.forEach(adv => {
            const advDate = new Date(adv.date);
            const amt = parseFloat(adv.paid || 0);

            if (advDate < startDate) {
                if (adv.transactionType === 'Pay') pmAdv += amt;
                else if (adv.transactionType === 'Received') pmAdv -= amt;
            } else if (advDate <= endDate) {
                if (adv.transactionType === 'Pay') cmAdv += amt;
                else if (adv.transactionType === 'Received') cmAdv -= amt;
            }
        });

        // Installment plans are intentionally separate from advance transaction rows.
        // Current-month advances must never overwrite carried pre-month installment.
        // Run both installment plan lookups in parallel for speed
        const [latestPreMonthPlan, latestCurrentMonthPlan] = await Promise.all([
            EmployeeAdvanceInstallmentPlan.findOne({
                employee: employeeId,
                monthYear: { $lte: monthYear },
                'preMonthInstallment.installment': { $gte: 0 }
            }).sort({ monthYear: -1, updatedAt: -1 }).lean(),
            EmployeeAdvanceInstallmentPlan.findOne({
                employee: employeeId,
                monthYear,
                'currentMonthInstallment.installment': { $gte: 0 }
            }).sort({ updatedAt: -1 }).lean()
        ]);

        if (latestPreMonthPlan) {
            pmAdvRecDefault = parseFloat(latestPreMonthPlan.preMonthInstallment.installment) || 0;
        }
        const currentPlanMatchesBalance = latestCurrentMonthPlan &&
            Math.abs((parseFloat(latestCurrentMonthPlan.currentMonthInstallment?.preBal) || 0) - Math.max(0, cmAdv)) < 0.01;
        if (currentPlanMatchesBalance) {
            cmAdvRecDefault = parseFloat(latestCurrentMonthPlan.currentMonthInstallment.installment) || 0;
        } else {
            cmAdvRecDefault = Math.max(0, cmAdv);
        }

        const totalAdvBalance = pmAdv + cmAdv;

        // Auto-correct and cap installments against actual balances
        // This prevents "ghost" recoveries if balance is 0, while respecting user's split inputs.
        pmAdvRecDefault = Math.min(pmAdvRecDefault, Math.max(0, pmAdv));
        cmAdvRecDefault = Math.min(cmAdvRecDefault, Math.max(0, cmAdv));


        const penalty = penalties.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        // Sum up commissions from all matching sheets
        let mComm = 0;
        let ugComm = 0;
        let wComm = 0;
        let nAmt = 0;
        let nDays = 0;
        let rAmt = 0;
        let rDays = 0;

        commissionDocs.forEach(doc => {
            const empComm = doc.data.find(d => d.id === employeeId.toString());
            if (empComm) {
                if (doc.type === 'distribute') {
                    mComm += (parseFloat(empComm.otherCommission) || 0);
                    ugComm += (parseFloat(empComm.ugCommission) || 0);
                    wComm += (parseFloat(empComm.warehouseCommission) || 0);
                } else if (doc.type === 'dep_item_wise') {
                    mComm += (parseFloat(empComm.total) || 0);
                } else if (doc.type === 'employee_wise') {
                    mComm += (parseFloat(empComm.commission) || 0);
                } else if (doc.type === 'sale_commission') {
                    mComm += (parseFloat(empComm.paidCommission) || 0);
                } else if (doc.type === 'rotti_nashta' || doc.type === 'rotti_perks') {
                    nAmt += (parseFloat(empComm.nashtaTotal) || 0);
                    nDays += (parseFloat(empComm.nashtaDays) || 0);
                    rAmt += (parseFloat(empComm.rottiTotal) || 0);
                    rDays += (parseFloat(empComm.rottiDays) || 0);
                }
            }
        });
        
        // DIVISOR FOR RATES
        // Based on user screenshot: 
        // Salary Display Rate = Basic / totalWdsPerMonth
        // OverTime Rate = Basic / 30 / DutyHrs (Fixed 30)
        const perDay = employee.basicSalary / totalWdsPerMonth;
        const perHrDisplay = perDay / dutyHrs;
        const perHrOTST = employee.basicSalary / 30 / dutyHrs; // Use 30 for OT/ST as observed in screenshot

        let otHrs = 0, stHrs = 0;
        if (workedHrsTotal > totalHrsMonthReg) {
            otHrs = workedHrsTotal - totalHrsMonthReg;
        } else if (workedHrsTotal < totalHrsMonthReg) {
            stHrs = totalHrsMonthReg - workedHrsTotal;
        }

        const otAmt = otHrs * perHrOTST;
        const stAmt = stHrs * perHrOTST;

        const fixAllow = employee.fixAllowance || 0;
        const otherAllow = employee.otherAllowance || 0;
        const gross = employee.basicSalary + otAmt + mComm + ugComm + wComm + nAmt + rAmt + fixAllow + otherAllow;
        const otherDeduction = employee.deduction || 0;
        const secDeposit = employee.securityDeposit || 0;
        const preTaxNet = gross - stAmt - totalAdvBalance - penalty - otherDeduction - secDeposit;

        // --- WHT (Income Tax) Calculation 2025-2026 ---
        let wht = 0;
        if (employee.payFullSalaryThroughBank) {
            const annualSalary = preTaxNet * 12;
            let annualTax = 0;

            if (annualSalary <= 600000) {
                annualTax = 0;
            } else if (annualSalary <= 1200000) {
                annualTax = (annualSalary - 600000) * 0.01;
            } else if (annualSalary <= 2200000) {
                annualTax = 6000 + (annualSalary - 1200000) * 0.11;
            } else if (annualSalary <= 3200000) {
                annualTax = 116000 + (annualSalary - 2200000) * 0.23;
            } else if (annualSalary <= 4100000) {
                annualTax = 346000 + (annualSalary - 3200000) * 0.30;
            } else {
                annualTax = 616000 + (annualSalary - 4100000) * 0.35;
            }

            // Apply 9% surcharge if annual taxable income exceeds 10 Million
            if (annualSalary > 10000000) {
                annualTax += (annualTax * 0.09);
            }

            wht = Math.round(annualTax / 12);
        }

        const net = preTaxNet - wht;

        res.status(200).json({
            success: true,
            data: {
                employee: employeeId,
                monthYear,
                branch: branch || employee.branch,
                code: employee.code,
                department: employee.department?.name || '',
                designation: employee.designation?.name || '',
                bank: employee.selectBank || 'N/A',
                offDay: employee.offDay || 'Sunday',
                perMonth: employee.basicSalary,
                totalDays,
                totalWdsPerMonth,
                totalHrsPerMonth: totalHrsMonthReg,
                totalHrsPerDay: dutyHrs,
                totalPerDay: perDay,
                totalPerHr: perHrDisplay, // Displayed current rate
                totalAbsents,
                allowedLeaves,
                workedHrs: Math.min(workedHrsTotal, totalHrsMonthReg), // Capped at requirement; excess goes to OT
                workedDays,
                overTimeHrs: otHrs,
                overTime: otAmt,
                shortTimeHrs: stHrs,
                shortTimeAmount: stAmt,
                monthlyComm: mComm,
                ugComm: ugComm,
                warehouseComm: wComm,
                teaAllowance: nAmt,
                nashtaDays: nDays,
                rent: rAmt,
                rotiDays: rDays,
                grossTotal: gross,
                netTotal: preTaxNet,
                pAAdv: pmAdv,
                csMale: cmAdv,
                pmAdvRec: pmAdvRecDefault,
                cmAdvRec: cmAdvRecDefault,
                securityDeposit: secDeposit,
                penalty,
                wht,
                fund: 0,
                ugrm: 0,
                otherDeduction: employee.deduction || 0,
                umrahDeduction: 0,
                natin: employee.fixAllowance || 0,
                otherAllow: employee.otherAllowance || 0,
                stLateAllow: employee.stLoss || 0,
                bankAmt: (employee.payFullSalaryThroughBank || false) ? preTaxNet : 0,
                bankPaid: (employee.payFullSalaryThroughBank || false) ? net : 0,
                
                // Flags from Employee Registration
                payFullSalaryThroughBank: employee.payFullSalaryThroughBank || false,
                thirtyWorkingDays: employee.thirtyWorkingDays || false,
                otst30WorkingDays: employee.otst30WorkingDays || false,
                fullStLessAllow: employee.stLoss || 0
            }
        });
    } catch (e) {
        console.error('calculatePayroll ERROR:', e.message, e.stack);
        res.status(500).json({ success: false, message: e.message });
    }
};

// Internal Function to sync advance ledger with salary deductions
const syncPayrollAdvanceLedger = async (payroll, userId) => {
    try {
        // ⚠️ GUARD #1: Skip if the payroll record itself is import-only.
        // This is the primary protection for real employees whose payroll was
        // touched by an Excel import. isImportOnly is stamped on the Payroll
        // document at import time, so we never need to look up the employee.
        if (payroll.isImportOnly === true) {
            return;
        }

        const Employee = require('../models/Employee');
        const emp = await Employee.findById(payroll.employee).select('code payrollImportOnly');

        // ⚠️ GUARD #2: Also skip for employees flagged as import-only or with IMP- code.
        if (!emp || emp.payrollImportOnly === true || (emp.code && emp.code.toUpperCase().startsWith('IMP-'))) {
            return;
        }

        const deductionAmount = parseFloat(payroll.totalAdv || 0);
        
        // Find if we already have an entry for this payroll
        let advance = await EmployeeAdvance.findOne({ payroll: payroll._id, transactionType: 'Received' });

        if (deductionAmount > 0) {
            // Month Logic: Find a valid date for that month
            const [y, m] = payroll.monthYear.split('-').map(Number);
            const deductionDate = new Date(Date.UTC(y, m - 1, 15)); // Anchor to mid-month PKR

            const payload = {
                employee: payroll.employee,
                payroll: payroll._id,
                date: deductionDate,
                branch: payroll.branch,
                transactionType: 'Received',
                code: payroll.code,
                paid: deductionAmount,
                remarks: `Salary Deduction [Payroll: ${payroll.monthYear}]`,
                updatedBy: userId
            };

            if (advance) {
                Object.assign(advance, payload);
                await advance.save();
            } else {
                payload.createdBy = userId;
                await EmployeeAdvance.create(payload);
            }
        } else if (advance) {
            // If amount was cleared (set to 0), delete the ledger entry
            await EmployeeAdvance.findByIdAndDelete(advance._id);
        }
        
        // Recalculate balance for this employee and REBUILD LEDGER collection
        if (typeof recalculateAdvanceBalances === 'function') {
            await recalculateAdvanceBalances(payroll.employee);
        }
        if (typeof recalculateEmployeeLedger === 'function') {
            await recalculateEmployeeLedger(payroll.employee);
        }
    } catch (err) {
        console.error('[Sync Ledger Error]:', err.message);
    }
};

exports.createPayroll = async (req, res) => {
    try { 
        req.body.createdBy = req.user._id; 
        const p = await Payroll.create(req.body); 
        
        // SYNC LEDGER
        await syncPayrollAdvanceLedger(p, req.user._id);

        res.status(201).json({ success: true, data: p }); 
    }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.updatePayroll = async (req, res) => {
    try { 
        const p = await Payroll.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' }); 
        if (!p) return res.status(404).json({ success: false, message: 'Not found' }); 
        
        // SYNC LEDGER
        await syncPayrollAdvanceLedger(p, req.user._id);

        res.status(200).json({ success: true, data: p }); 
    }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deletePayroll = async (req, res) => {
    try { 
        const p = await Payroll.findByIdAndDelete(req.params.id); 
        if (!p) return res.status(404).json({ success: false, message: 'Not found' }); 
        
        // If payroll is deleted, also delete the corresponding ledger deduction
        await EmployeeAdvance.deleteMany({ payroll: p._id });
        
        // Sync both the Advance history and the Ledger collection
        await recalculateAdvanceBalances(p.employee);
        await recalculateEmployeeLedger(p.employee);

        res.status(200).json({ success: true, data: {} }); 
    }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
