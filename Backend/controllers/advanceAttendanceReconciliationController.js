const mongoose = require('mongoose');
const AdvanceAttendanceReconciliation = require('../models/AdvanceAttendanceReconciliation');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const EmployeeAdjustment = require('../models/EmployeeAdjustment');

// Helper to normalize any date to 00:00:00 Pakistan Standard Time
const normalizeDateToPKT = (dateInput) => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const pktDate = new Date(d.getTime() + PKT_OFFSET_MS);
    const y = pktDate.getUTCFullYear();
    const m = pktDate.getUTCMonth();
    const day = pktDate.getUTCDate();
    return new Date(Date.UTC(y, m, day, 0, 0, 0) - PKT_OFFSET_MS);
};

// Format date as YYYY-MM-DD
const formatDateStr = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const pkt = new Date(d.getTime() + PKT_OFFSET_MS);
    const y = pkt.getUTCFullYear();
    const m = String(pkt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(pkt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Parse time string to minutes from midnight
const parseTimeToMinutes = (timeStr, isMidnightAllowed = false) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const cleanStr = timeStr.trim().toUpperCase();
    if (['-', '--:--', ''].includes(cleanStr)) return 0;

    let hours = 0, minutes = 0;
    const ampmMatch = cleanStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (ampmMatch) {
        hours = parseInt(ampmMatch[1], 10);
        minutes = parseInt(ampmMatch[2], 10);
        const meridiem = ampmMatch[3];
        if (meridiem) {
            if (meridiem.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        let total = (hours * 60) + minutes;
        if (total === 0 && isMidnightAllowed) return 1440; // 12:00 AM checkout next day
        return total;
    }

    if (cleanStr.includes(':')) {
        const parts = cleanStr.split(':');
        hours = parseInt(parts[0], 10) || 0;
        minutes = parseInt(parts[1], 10) || 0;
        let total = (hours * 60) + minutes;
        if (total === 0 && isMidnightAllowed) return 1440;
        return total;
    }

    return 0;
};

// Convert minutes to HH:MM format
const minutesToHHMM = (totalMins) => {
    if (totalMins === undefined || totalMins === null || isNaN(totalMins)) return '0:00';
    const absMins = Math.abs(Math.round(totalMins));
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
};

// Helper: Verify if user has access to a specific branch based on user rights
const isUserAllowedBranch = (user, requestedBranch) => {
    if (!user) return false;
    const role = (user.role || "").toLowerCase();
    const isSuperAdmin = ["admin", "superadmin", "administrator"].includes(role);

    let userBranches = [];
    if (Array.isArray(user.branch)) {
        userBranches = user.branch.map(b => String(b).trim()).filter(Boolean);
    } else if (typeof user.branch === "string" && user.branch.trim()) {
        userBranches = user.branch.split(",").map(b => b.trim()).filter(Boolean);
    }

    const clean = s => String(s || "").replace(/[()]/g, "").trim().toLowerCase();
    const userBranchesClean = userBranches.map(clean);

    // Explicit "all branches" permission
    if (userBranchesClean.includes("all") || userBranchesClean.includes("all branches")) {
        return true;
    }

    // Admin with no specific branch restrictions has full access
    if (isSuperAdmin && userBranches.length === 0) {
        return true;
    }

    // Check if requested branch matches allowed branch
    const reqClean = clean(requestedBranch);
    const reqRaw = String(requestedBranch).trim().toLowerCase();
    return userBranches.some(b => b.toLowerCase() === reqRaw) || userBranchesClean.includes(reqClean);
};

// Calculate worked minutes between check-in and check-out
const calculateWorkedMinutes = (checkInStr, checkOutStr) => {
    const inMins = parseTimeToMinutes(checkInStr, false);
    const outMins = parseTimeToMinutes(checkOutStr, true);
    if (inMins <= 0 || outMins <= 0) return 0;

    if (outMins >= inMins) {
        return outMins - inMins;
    } else {
        // Shift crosses midnight (e.g. 8:00 PM to 4:00 AM)
        return (1440 - inMins) + outMins;
    }
};

/**
 * @desc    Get advance vs actual attendance reconciliation matrix
 * @route   GET /api/v1/attendance-reconciliation
 */
exports.getReconciliation = async (req, res) => {
    try {
        const { from, to, branch, department, employee } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: 'Both "from" and "to" dates are required.'
            });
        }

        if (!branch || branch === '' || branch === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Please select a branch to load attendance records.'
            });
        }

        if (!isUserAllowedBranch(req.user, branch)) {
            return res.status(403).json({
                success: false,
                message: `Access denied: You do not have permission to access branch "${branch}".`
            });
        }

        const startPKT = normalizeDateToPKT(from);
        const endPKT = normalizeDateToPKT(to);

        if (startPKT > endPKT) {
            return res.status(400).json({
                success: false,
                message: '"from" date cannot be after "to" date.'
            });
        }

        // Query active employees
        const empQuery = {
            isActive: { $ne: false },
            payrollImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        };

        if (branch && branch !== 'all' && branch !== 'null' && branch !== '') {
            const cleanBr = branch.replace(/[()]/g, '').trim();
            empQuery.branch = new RegExp(`^\\(?${cleanBr}\\)?$`, 'i');
        }

        if (department && department !== 'all' && department !== 'null' && department !== '') {
            empQuery.department = department;
        }

        if (employee && employee !== 'all' && employee !== 'null' && employee !== '') {
            empQuery._id = employee;
        }

        const employees = await Employee.find(empQuery)
            .select('code name branch department designation basicSalary totalHrs fDutyTime tDutyTime')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ branch: 1, code: 1 })
            .lean();

        if (employees.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                data: [],
                summary: {
                    totalEmployees: 0,
                    totalAdvanceHours: '0:00',
                    totalActualHours: '0:00',
                    netDiffHours: '0:00',
                    netDiffMode: '+',
                    netShortHours: '0:00',
                    netOvertimeHours: '0:00'
                }
            });
        }

        const empIds = employees.map(e => e._id);

        // Employee IDs are already branch-scoped; match attendance by employee/date
        // so cross-branch records remain visible like they do in the attendance register.
        const attFilter = {
            employee: { $in: empIds },
            date: { $gte: startPKT, $lte: new Date(endPKT.getTime() + 24 * 60 * 60 * 1000 - 1) }
        };

        const attendanceRecords = await Attendance.find(attFilter)
            .select('employee date branch checkIn checkOut workedHrs displayStatus isPresent remarks')
            .lean();

        // Fetch any existing saved reconciliation records
        const reconFilter = {
            employee: { $in: empIds },
            date: { $gte: startPKT, $lte: new Date(endPKT.getTime() + 24 * 60 * 60 * 1000 - 1) }
        };

        const reconciliationRecords = await AdvanceAttendanceReconciliation.find(reconFilter)
            .select('employee date branch actualCheckIn actualCheckOut actualHours actualStatus diffMinutes remarks')
            .lean();

        // Map baseline attendance by `${empId}_${dateStr}`
        const attendanceMap = new Map();
        attendanceRecords.forEach(att => {
            const dStr = formatDateStr(att.date);
            attendanceMap.set(`${att.employee.toString()}_${dStr}`, att);
        });

        // Map saved reconciliations by `${empId}_${dateStr}`
        const reconMap = new Map();
        reconciliationRecords.forEach(rec => {
            const dStr = formatDateStr(rec.date);
            reconMap.set(`${rec.employee.toString()}_${dStr}`, rec);
        });

        // Generate date array from startPKT to endPKT
        const dateList = [];
        let cur = new Date(startPKT);
        while (cur <= endPKT) {
            dateList.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
        }

        let overallAdvanceMins = 0;
        let overallActualMins = 0;
        let overallShortMins = 0;
        let overallOvertimeMins = 0;

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Build per-employee reconciliation list
        const results = employees.map((emp, index) => {
            const empIdStr = emp._id.toString();
            let empAdvanceMins = 0;
            let empActualMins = 0;
            let empSavedCount = 0;

            const days = dateList.map(d => {
                const dStr = formatDateStr(d);
                const dayName = dayNames[d.getDay()];
                const key = `${empIdStr}_${dStr}`;

                const att = attendanceMap.get(key);
                const rec = reconMap.get(key);

                // Advance Baseline Values
                let advIn = att?.checkIn || '';
                let advOut = att?.checkOut || '';
                let advStatus = att?.displayStatus || (att?.isPresent === false ? 'Absent' : (att?.checkIn ? 'Present' : 'Absent'));
                let advMins = 0;

                if (att?.workedHrs) {
                    advMins = parseTimeToMinutes(att.workedHrs, false);
                }
                if (advMins === 0 && advIn && advOut) {
                    advMins = calculateWorkedMinutes(advIn, advOut);
                }

                // If saved reconciliation exists, it takes precedence for actuals
                let actIn = '';
                let actOut = '';
                let actStatus = 'Absent';
                let actMins = 0;
                let remarks = '';
                let isSaved = false;

                if (rec) {
                    isSaved = true;
                    empSavedCount++;
                    actIn = rec.actualCheckIn || '';
                    actOut = rec.actualCheckOut || '';
                    actStatus = rec.actualStatus || 'Present';
                    actMins = rec.actualHours ? Math.round(rec.actualHours * 60) : calculateWorkedMinutes(actIn, actOut);
                    remarks = rec.remarks || '';
                } else {
                    // Default actuals: empty until user enters them or clicks Copy Adv
                    actIn = '';
                    actOut = '';
                    actStatus = 'Absent';
                    actMins = 0;
                    remarks = '';
                }

                if (actStatus === 'Absent') {
                    actMins = 0;
                }

                // Calculate difference for this specific day
                const diffMins = actMins - advMins;
                const diffMode = diffMins >= 0 ? '+' : '-';
                const diffHoursFormatted = (diffMins === 0 ? '0:00' : `${diffMode}${minutesToHHMM(Math.abs(diffMins))}`);

                empAdvanceMins += advMins;
                empActualMins += actMins;

                return {
                    date: dStr,
                    rawDate: d,
                    dayName,
                    advanceCheckIn: advIn,
                    advanceCheckOut: advOut,
                    advanceMinutes: advMins,
                    advanceHours: +(advMins / 60).toFixed(2),
                    advanceHoursFormatted: minutesToHHMM(advMins),
                    advanceStatus: advStatus,

                    actualCheckIn: actIn,
                    actualCheckOut: actOut,
                    actualMinutes: actMins,
                    actualHours: +(actMins / 60).toFixed(2),
                    actualHoursFormatted: minutesToHHMM(actMins),
                    actualStatus: actStatus,

                    diffMinutes: diffMins,
                    diffMode,
                    diffHoursFormatted,
                    remarks,
                    isSaved
                };
            });

            const netDiffMins = empActualMins - empAdvanceMins;
            const netDiffMode = netDiffMins >= 0 ? '+' : '-';
            const netDiffHoursFormatted = (netDiffMins === 0 ? '0:00' : `${netDiffMode}${minutesToHHMM(Math.abs(netDiffMins))}`);

            // Estimate hourly wage rate for salary adjustment based on employee duty hours
            const basicSalary = emp.basicSalary || 0;
            let dutyHrs = 0;
            if (emp.totalHrs) {
                const parsed = parseFloat(String(emp.totalHrs).replace(/[^0-9.]/g, ''));
                if (!isNaN(parsed) && parsed > 0) dutyHrs = parsed;
            }
            if (!dutyHrs && emp.fDutyTime && emp.tDutyTime) {
                const shiftMins = calculateWorkedMinutes(emp.fDutyTime, emp.tDutyTime);
                if (shiftMins > 0) dutyHrs = +(shiftMins / 60).toFixed(1);
            }
            if (!dutyHrs) dutyHrs = 12;

            const hourlyRate = basicSalary > 0 && dutyHrs > 0 ? (basicSalary / 30 / dutyHrs) : 0;
            const estimatedAdjustmentAmount = Math.round((netDiffMins / 60) * hourlyRate);

            overallAdvanceMins += empAdvanceMins;
            overallActualMins += empActualMins;
            if (netDiffMins < 0) overallShortMins += Math.abs(netDiffMins);
            if (netDiffMins > 0) overallOvertimeMins += netDiffMins;

            return {
                sr: index + 1,
                employeeId: emp._id,
                code: emp.code,
                name: emp.name,
                branch: emp.branch,
                department: emp.department?.name || '-',
                designation: emp.designation?.name || '-',
                basicSalary,
                dutyHrs,
                totalHrs: dutyHrs,
                fDutyTime: emp.fDutyTime || '',
                tDutyTime: emp.tDutyTime || '',
                hourlyRate: Math.round(hourlyRate),
                totalAdvanceMinutes: empAdvanceMins,
                totalAdvanceHours: +(empAdvanceMins / 60).toFixed(2),
                totalAdvanceHoursFormatted: minutesToHHMM(empAdvanceMins),

                totalActualMinutes: empActualMins,
                totalActualHours: +(empActualMins / 60).toFixed(2),
                totalActualHoursFormatted: minutesToHHMM(empActualMins),

                netDiffMinutes: netDiffMins,
                netDiffMode,
                netDiffHoursFormatted,
                estimatedAdjustmentAmount,
                allDaysSaved: empSavedCount === dateList.length,
                days
            };
        });

        const overallNetMins = overallActualMins - overallAdvanceMins;
        const overallNetMode = overallNetMins >= 0 ? '+' : '-';

        res.status(200).json({
            success: true,
            count: results.length,
            period: {
                from: formatDateStr(startPKT),
                to: formatDateStr(endPKT),
                totalDays: dateList.length
            },
            summary: {
                totalEmployees: results.length,
                totalAdvanceHours: minutesToHHMM(overallAdvanceMins),
                totalActualHours: minutesToHHMM(overallActualMins),
                netDiffHours: `${overallNetMode}${minutesToHHMM(Math.abs(overallNetMins))}`,
                netDiffMode: overallNetMode,
                netShortHours: `-${minutesToHHMM(overallShortMins)}`,
                netOvertimeHours: `+${minutesToHHMM(overallOvertimeMins)}`
            },
            data: results
        });
    } catch (error) {
        console.error('Error fetching advance reconciliation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error while fetching reconciliation data'
        });
    }
};

/**
 * @desc    Save/Update advance reconciliation records in bulk
 * @route   POST /api/v1/attendance-reconciliation/save
 */
exports.saveReconciliation = async (req, res) => {
    try {
        const { periodFrom, periodTo, records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No reconciliation records provided to save.'
            });
        }

        const normFrom = normalizeDateToPKT(periodFrom);
        const normTo = normalizeDateToPKT(periodTo);
        const userId = req.user?._id;

        for (const rec of records) {
            if (rec.branch && !isUserAllowedBranch(req.user, rec.branch)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: You do not have permission to save records for branch "${rec.branch}".`
                });
            }
        }

        const bulkOps = records.map(rec => {
            const normDate = normalizeDateToPKT(rec.date);
            let actStatus = rec.actualStatus || (rec.actualCheckIn && rec.actualCheckOut ? 'Present' : 'Absent');
            if (rec.actualCheckIn && rec.actualCheckOut && actStatus === 'Absent') {
                actStatus = 'Present';
            }
            const actMins = (actStatus === 'Absent') ? 0 : (rec.actualMinutes !== undefined ? rec.actualMinutes : calculateWorkedMinutes(rec.actualCheckIn, rec.actualCheckOut));
            const advMins = rec.advanceMinutes !== undefined ? rec.advanceMinutes : calculateWorkedMinutes(rec.advanceCheckIn, rec.advanceCheckOut);
            const diffMins = actMins - advMins;
            const diffMode = diffMins >= 0 ? '+' : '-';

            const updateDoc = {
                employee: rec.employeeId,
                date: normDate,
                branch: rec.branch || 'F-6',
                advanceCheckIn: rec.advanceCheckIn || '',
                advanceCheckOut: rec.advanceCheckOut || '',
                advanceHours: +(advMins / 60).toFixed(2),
                advanceHoursFormatted: minutesToHHMM(advMins),
                advanceStatus: rec.advanceStatus || 'Present',

                actualCheckIn: rec.actualCheckIn || '',
                actualCheckOut: rec.actualCheckOut || '',
                actualHours: +(actMins / 60).toFixed(2),
                actualHoursFormatted: minutesToHHMM(actMins),
                actualStatus: actStatus,

                diffMinutes: diffMins,
                diffHoursFormatted: `${diffMode}${minutesToHHMM(Math.abs(diffMins))}`,
                diffMode,
                remarks: rec.remarks || '',
                periodFrom: normFrom,
                periodTo: normTo,
                updatedBy: userId
            };

            return {
                updateOne: {
                    filter: { employee: rec.employeeId, date: normDate },
                    update: {
                        $set: updateDoc,
                        $setOnInsert: { createdBy: userId }
                    },
                    upsert: true
                }
            };
        });

        const result = await AdvanceAttendanceReconciliation.bulkWrite(bulkOps, { ordered: false });

        res.status(200).json({
            success: true,
            message: 'Advance attendance reconciliation records saved successfully.',
            upsertedCount: result.upsertedCount,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error saving advance reconciliation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error while saving reconciliation'
        });
    }
};

/**
 * @desc    Auto-create EmployeeAdjustment records for next month salary deduction/addition
 * @route   POST /api/v1/attendance-reconciliation/sync-adjustments
 */
exports.syncToEmployeeAdjustment = async (req, res) => {
    try {
        const { adjustments, targetMonthYear, adjustmentDate } = req.body;

        if (!Array.isArray(adjustments) || adjustments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No adjustments provided to sync.'
            });
        }

        const adjDate = adjustmentDate ? new Date(adjustmentDate) : new Date();
        const createdBy = req.user?._id;
        const createdAdjustments = [];

        for (const item of adjustments) {
            if (!item.employeeId || !item.amount) continue;

            // Type: If negative diff -> Short Time Deduction, if positive diff -> Overtime Earning
            const adjType = item.amount < 0 ? 'Deduction' : 'Addition';
            const absAmount = Math.abs(item.amount);

            const doc = await EmployeeAdjustment.create({
                date: adjDate,
                type: adjType,
                branch: item.branch || 'F-6',
                employee: item.employeeId,
                amount: absAmount,
                remarks: `Advance vs Actual Reconciliation (${item.netDiffHoursFormatted || ''}) for ${targetMonthYear || 'Next Month'}`,
                createdBy
            });

            createdAdjustments.push(doc);
        }

        res.status(200).json({
            success: true,
            message: `Successfully synced ${createdAdjustments.length} adjustment records.`,
            data: createdAdjustments
        });
    } catch (error) {
        console.error('Error syncing adjustments:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error while syncing adjustments'
        });
    }
};


/**
 * @desc    Clear/Delete saved reconciliation records for a branch and period
 * @route   POST /api/v1/attendance-reconciliation/clear
 */
exports.clearReconciliation = async (req, res) => {
    try {
        const { from, to, branch } = req.body;
        if (!from || !to || !branch) {
            return res.status(400).json({ success: false, message: 'From, To and Branch are required.' });
        }

        if (!isUserAllowedBranch(req.user, branch)) {
            return res.status(403).json({
                success: false,
                message: `Access denied: You do not have permission to clear records for branch "${branch}".`
            });
        }

        const startPKT = normalizeDateToPKT(from);
        const endPKT = normalizeDateToPKT(to);

        const result = await AdvanceAttendanceReconciliation.deleteMany({
            date: { $gte: startPKT, $lte: new Date(endPKT.getTime() + 24 * 60 * 60 * 1000 - 1) },
            branch: branch
        });

        res.status(200).json({
            success: true,
            message: `Cleared ${result.deletedCount} saved reconciliation records from database.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error clearing reconciliation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error while clearing reconciliation'
        });
    }
};
