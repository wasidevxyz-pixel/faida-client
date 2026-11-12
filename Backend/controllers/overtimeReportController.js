const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const { employeeCache } = require('../utils/memoryCache');

const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', ''].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

// ─── Helper: normalize to PKT midnight (same logic as attendanceController) ────
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

// ─── Helper: parse "HH:mm" or "H:mm AM/PM" to minutes ────────────────────────
const timeToMins = (val, isMidnightAllowed = false) => {
    if (!val) return 0;
    const str = String(val).trim().toUpperCase();
    if (['-', '--:--', ''].includes(str)) return 0;
    const ampm = str.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (ampm) {
        let h = parseInt(ampm[1]);
        const mi = parseInt(ampm[2]);
        if (ampm[3] === 'PM' && h < 12) h += 12;
        if (ampm[3] === 'AM' && h === 12) h = 0;
        const result = h * 60 + mi;
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

// ─── Helper: compute actual worked minutes from raw checkIn/checkOut ──────────
const computeWorkedMins = (rec) => {
    if (!rec.checkIn || !rec.checkOut) return 0;
    const inStr  = String(rec.checkIn).trim();
    const outStr = String(rec.checkOut).trim();
    if (['-', '--:--', ''].includes(inStr) || ['-', '--:--', ''].includes(outStr)) return 0;

    const inMin  = timeToMins(inStr, false);
    const outMin = timeToMins(outStr, true);
    if (outMin === 0) return 0;

    let grossMins = outMin - inMin;
    if (grossMins < 0) grossMins += 1440; // overnight shift

    let breakMins = 0;
    const bOut = String(rec.breakOut || '').trim();
    const bIn  = String(rec.breakIn  || '').trim();
    if (bOut && bIn && !['-', '--:--', ''].includes(bOut) && !['-', '--:--', ''].includes(bIn)) {
        const bOutMin = timeToMins(bOut, false);
        const bInMin  = timeToMins(bIn,  false);
        if (bOutMin > 0 && bInMin > 0) {
            breakMins = bInMin - bOutMin;
            if (breakMins < 0) breakMins += 1440;
            if (breakMins < 0) breakMins = 0;
        }
    }

    let netMins = grossMins - breakMins;
    if (netMins < 0) netMins = 0;

    let diffMins = 0;
    const dIn  = String(rec.timeDiffIn  || '').trim();
    const dOut = String(rec.timeDiffOut || '').trim();
    if (dIn && dOut && !['-', '--:--', ''].includes(dIn) && !['-', '--:--', ''].includes(dOut)) {
        const dInMin  = timeToMins(dIn,  false);
        const dOutMin = timeToMins(dOut, false);
        if (dOutMin > 0 || dInMin > 0) {
            diffMins = dOutMin - dInMin;
            if (diffMins < 0) diffMins += 1440;
            if (diffMins < 0) diffMins = 0;
        }
    }

    const mode = rec.diffMode || '+';
    let finalMins = netMins;
    if (mode === '+') finalMins += diffMins;
    else if (mode === '-') finalMins -= diffMins;
    if (finalMins < 0) finalMins = 0;

    return Math.min(finalMins, 1440);
};

const minsToHHMM = (mins) => {
    const total = Math.abs(Math.round(mins));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Comprehensive OverTime & Short Time Report (Summary & Detail)
// @route GET /api/v1/reports/overtime-shorttime
// ─────────────────────────────────────────────────────────────────────────────
exports.getOvertimeShortTimeReport = async (req, res) => {
    try {
        const { from, to, criteria = 'OverTime', viewMode = 'summary', branch, department, employee, search } = req.query;

        if (!from || !to) {
            return res.status(400).json({ success: false, message: 'from and to dates are required' });
        }

        const userRole = (req.user?.role || '').toLowerCase();
        const isAdmin = ['admin', 'administrator', 'superadmin'].includes(userRole) ||
            (req.user?.groupId?.rights?.admin === true || req.user?.groupId?.rights?.administration === true);

        let allowedBranches = [];
        if (!isAdmin) {
            allowedBranches = Array.isArray(req.user.branch) ? req.user.branch : (req.user.branch ? [req.user.branch] : []);
            if (allowedBranches.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    summaryData: [],
                    detailData: [],
                    totals: {
                        totalEmployees: 0,
                        totalWorkedMins: 0,
                        totalWorkedHrs: '0:00',
                        totalOTMins: 0,
                        totalOTHrs: '0:00',
                        totalOTAmount: '0.00',
                        totalSTMins: 0,
                        totalSTHrs: '0:00',
                        totalSTAmount: '0.00',
                        netAmount: '0.00'
                    }
                });
            }
        }

        const empQuery = { isActive: true };

        let requestedBranch = null;
        if (branch && branch !== 'all' && branch !== 'null' && branch !== '') {
            requestedBranch = String(branch).trim();
        }
        if (requestedBranch) {
            if (!isAdmin) {
                const allowed = allowedBranches.some(ub => ub.toLowerCase() === requestedBranch.toLowerCase());
                if (!allowed) {
                    return res.status(200).json({
                        success: true,
                        data: [],
                        summaryData: [],
                        detailData: [],
                        totals: {
                            totalEmployees: 0,
                            totalWorkedMins: 0,
                            totalWorkedHrs: '0:00',
                            totalOTMins: 0,
                            totalOTHrs: '0:00',
                            totalOTAmount: '0.00',
                            totalSTMins: 0,
                            totalSTHrs: '0:00',
                            totalSTAmount: '0.00',
                            netAmount: '0.00'
                        }
                    });
                }
            }
            const branchRegex = makeBranchRegex(requestedBranch);
            if (branchRegex) empQuery.branch = branchRegex;
        } else if (!isAdmin && allowedBranches.length > 0) {
            empQuery.branch = { $in: allowedBranches };
        }

        if (department && mongoose.Types.ObjectId.isValid(department)) {
            empQuery.department = new mongoose.Types.ObjectId(department);
        }

        if (employee && mongoose.Types.ObjectId.isValid(employee)) {
            empQuery._id = new mongoose.Types.ObjectId(employee);
        } else if (search && search.trim()) {
            const q = search.trim();
            empQuery.$or = [
                { name: { $regex: q, $options: 'i' } },
                { code: { $regex: q, $options: 'i' } }
            ];
        }

        const employees = await Employee.find(empQuery)
            .select('name code branch department designation basicSalary fDutyTime tDutyTime totalHrs')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ code: 1 })
            .lean();

        if (employees.length === 0) {
            return res.status(200).json({
                success: true,
                criteria,
                viewMode,
                holidays,
                workingDays: 0,
                totalDays: 0,
                data: [],
                summaryData: [],
                detailData: [],
                totals: {
                    totalEmployees: 0,
                    totalWorkedMins: 0,
                    totalWorkedHrs: '0:00',
                    totalOTMins: 0,
                    totalOTHrs: '0:00',
                    totalOTAmount: '0.00',
                    totalSTMins: 0,
                    totalSTHrs: '0:00',
                    totalSTAmount: '0.00',
                    netAmount: '0.00'
                }
            });
        }

        const empIds = employees.map(e => e._id);
        const start = normalizeDateToPKT(from);
        const end = new Date(normalizeDateToPKT(to).getTime() + 24 * 60 * 60 * 1000);

        const attendanceRecords = await Attendance.find({
            employee: { $in: empIds },
            date: { $gte: start, $lt: end }
        })
            .select('employee date checkIn checkOut workedHrs displayStatus breakIn breakOut timeDiffIn timeDiffOut diffMode totalHrs')
            .lean();

        const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
        const toPKTDateStr = (dateVal) => {
            const d = new Date(new Date(dateVal).getTime() + PKT_OFFSET_MS);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        };

        const attendanceMap = {};
        for (const rec of attendanceRecords) {
            const empId = rec.employee.toString();
            const dateStr = toPKTDateStr(rec.date);
            if (!attendanceMap[empId]) attendanceMap[empId] = {};
            attendanceMap[empId][dateStr] = rec;
        }

        const allDates = [];
        let countSundays = 0;
        let curr = new Date(from + 'T00:00:00Z');
        const stop = new Date(to   + 'T00:00:00Z');
        while (curr <= stop) {
            const y = curr.getUTCFullYear();
            const m = String(curr.getUTCMonth()+1).padStart(2,'0');
            const d = String(curr.getUTCDate()).padStart(2,'0');
            allDates.push(`${y}-${m}-${d}`);
            if (curr.getUTCDay() === 0) countSundays++; // 0 = Sunday
            curr.setUTCDate(curr.getUTCDate() + 1);
        }

        let holidays = countSundays;
        if (req.query.holidays !== undefined && req.query.holidays !== null && req.query.holidays !== '') {
            const parsed = parseInt(req.query.holidays);
            if (!isNaN(parsed) && parsed >= 0) holidays = parsed;
        }

        const totalDaysInRange = allDates.length;
        const divisorDays = Math.max(1, totalDaysInRange - holidays);

        const detailRows = [];
        const summaryRows = [];

        let grandTotalWorkedMins = 0;
        let grandTotalOTMins = 0;
        let grandTotalSTMins = 0;
        let grandTotalOTAmount = 0;
        let grandTotalSTAmount = 0;

        for (const emp of employees) {
            const empIdStr = emp._id.toString();
            const deptName = emp.department?.name || 'General';
            const desigName = emp.designation?.name || '-';

            let dutyHrs = 0;
            if (emp.totalHrs) {
                const parsed = parseFloat(String(emp.totalHrs));
                if (!isNaN(parsed) && parsed > 0) dutyHrs = parsed;
            }
            if (!dutyHrs && emp.fDutyTime && emp.tDutyTime) {
                const fParts = String(emp.fDutyTime).split(':').map(Number);
                const tParts = String(emp.tDutyTime).split(':').map(Number);
                if (fParts.length >= 2 && tParts.length >= 2) {
                    let dM = (tParts[0] * 60 + tParts[1]) - (fParts[0] * 60 + fParts[1]);
                    if (dM < 0) dM += 1440;
                    if (dM > 0) dutyHrs = dM / 60;
                }
            }
            if (!dutyHrs || dutyHrs <= 0) dutyHrs = 8;

            const dutyMins = Math.round(dutyHrs * 60);
            const basicSalary = Number(emp.basicSalary) || 0;
            const perHourSalary = (basicSalary / divisorDays) / dutyHrs;

            let empWorkedMins = 0;
            let empOTMins = 0;
            let empSTMins = 0;
            let empPresentDays = 0;
            const empDetailLogs = [];

            for (const dateStr of allDates) {
                const rec = attendanceMap[empIdStr]?.[dateStr];
                if (!rec || rec.displayStatus === 'Absent') continue;

                let workedMins = computeWorkedMins(rec);
                if (workedMins === 0 && rec.totalHrs && rec.totalHrs > 0 && rec.displayStatus === 'Present') {
                    workedMins = Math.round(rec.totalHrs * 60);
                }

                if (workedMins === 0) continue;

                empPresentDays++;
                empWorkedMins += workedMins;

                const diffMins = workedMins - dutyMins;
                let otMins = 0;
                let stMins = 0;

                if (diffMins > 0) {
                    otMins = diffMins;
                } else if (diffMins < 0) {
                    stMins = Math.abs(diffMins);
                }

                empOTMins += otMins;
                empSTMins += stMins;

                const otAmount = (otMins / 60) * perHourSalary;
                const stAmount = (stMins / 60) * perHourSalary;
                const activeAmount = criteria === 'OverTime' ? otAmount : (criteria === 'ShortTime' ? stAmount : (otAmount - stAmount));

                // Decide whether this day should be included in detail rows based on criteria:
                let includeInDetail = false;
                if (criteria === 'OverTime') {
                    includeInDetail = otMins > 0;
                } else if (criteria === 'ShortTime') {
                    includeInDetail = stMins > 0;
                } else {
                    // Both
                    includeInDetail = (otMins > 0 || stMins > 0 || workedMins > 0);
                }

                if (includeInDetail) {
                    const detailRow = {
                        employeeId: empIdStr,
                        code: emp.code,
                        name: emp.name,
                        branch: emp.branch || '-',
                        department: deptName,
                        designation: desigName,
                        date: dateStr,
                        status: rec.displayStatus || 'Present',
                        checkIn: rec.checkIn || '-',
                        checkOut: rec.checkOut || '-',
                        dutyHrs: dutyHrs.toFixed(2),
                        dutyMins,
                        workedMins,
                        workedHrs: minsToHHMM(workedMins),
                        overtimeMins: otMins,
                        overtimeHrs: minsToHHMM(otMins),
                        shorttimeMins: stMins,
                        shorttimeHrs: minsToHHMM(stMins),
                        perHourSalary: perHourSalary.toFixed(2),
                        otAmount: otAmount.toFixed(2),
                        stAmount: stAmount.toFixed(2),
                        amount: activeAmount.toFixed(2)
                    };
                    detailRows.push(detailRow);
                    empDetailLogs.push(detailRow);
                }
            }

            const monthlyReqMins = Math.round(divisorDays * dutyMins);
            const monthlyReqHrs = (monthlyReqMins / 60).toFixed(2);
            const monthlyDiffMins = empWorkedMins - monthlyReqMins;
            const monthlyDiffDecimal = (monthlyDiffMins / 60).toFixed(2);
            const monthlyDiffHrs = (monthlyDiffMins >= 0 ? '+' : '-') + minsToHHMM(Math.abs(monthlyDiffMins));

            // True Monthly Overtime & Short Time:
            // If total worked < required -> 0 Overtime, shortfall is Short Time!
            // If total worked > required -> excess is Overtime, 0 Short Time!
            let finalOTMins = 0;
            let finalSTMins = 0;

            if (monthlyDiffMins > 0) {
                finalOTMins = monthlyDiffMins;
                finalSTMins = 0;
            } else if (monthlyDiffMins < 0) {
                finalOTMins = 0;
                finalSTMins = Math.abs(monthlyDiffMins);
            }

            const finalOTAmount = (finalOTMins / 60) * perHourSalary;
            const finalSTAmount = (finalSTMins / 60) * perHourSalary;
            const finalNetAmount = finalOTAmount - finalSTAmount;

            let includeInSummary = false;
            if (criteria === 'OverTime') {
                includeInSummary = finalOTMins > 0;
            } else if (criteria === 'ShortTime') {
                includeInSummary = finalSTMins > 0;
            } else {
                // Both
                includeInSummary = (finalOTMins > 0 || finalSTMins > 0);
            }

            // Always include if specifically searched by employee ID
            if (employee && String(emp._id) === String(employee)) {
                includeInSummary = true;
            }

            if (includeInSummary) {
                grandTotalWorkedMins += empWorkedMins;
                grandTotalOTMins += finalOTMins;
                grandTotalSTMins += finalSTMins;
                grandTotalOTAmount += finalOTAmount;
                grandTotalSTAmount += finalSTAmount;

                summaryRows.push({
                    employeeId: empIdStr,
                    code: emp.code,
                    name: emp.name,
                    branch: emp.branch || '-',
                    department: deptName,
                    designation: desigName,
                    basicSalary: basicSalary.toFixed(2),
                    perHourSalary: perHourSalary.toFixed(2),
                    dutyHrs: dutyHrs.toFixed(2),
                    presentDays: empPresentDays,
                    workingDays: divisorDays,
                    cmDays: divisorDays,
                    reqHrs: monthlyReqHrs,
                    totalWorkedMins: empWorkedMins,
                    totalWorkedHrs: minsToHHMM(empWorkedMins),
                    workedHrs: minsToHHMM(empWorkedMins),
                    workedHrsDecimal: (empWorkedMins / 60).toFixed(2),
                    monthlyDiffMins: monthlyDiffMins,
                    monthlyDiffHrs: monthlyDiffHrs,
                    monthlyDiffDecimal: monthlyDiffDecimal,
                    totalOTMins: finalOTMins,
                    totalOTHrs: minsToHHMM(finalOTMins),
                    otHrs: minsToHHMM(finalOTMins),
                    otHrsDecimal: (finalOTMins / 60).toFixed(2),
                    totalSTMins: finalSTMins,
                    totalSTHrs: minsToHHMM(finalSTMins),
                    stHrs: minsToHHMM(finalSTMins),
                    stHrsDecimal: (finalSTMins / 60).toFixed(2),
                    totalOTAmount: finalOTAmount.toFixed(2),
                    otRs: Math.round(finalOTAmount),
                    totalSTAmount: finalSTAmount.toFixed(2),
                    stRs: Math.round(finalSTAmount),
                    netAmount: finalNetAmount.toFixed(2),
                    netRs: Math.round(finalNetAmount),
                    activeAmount: criteria === 'OverTime' ? finalOTAmount.toFixed(2) : (criteria === 'ShortTime' ? finalSTAmount.toFixed(2) : finalNetAmount.toFixed(2)),
                    activeHrs: criteria === 'OverTime' ? minsToHHMM(finalOTMins) : (criteria === 'ShortTime' ? minsToHHMM(finalSTMins) : (finalOTMins > 0 ? minsToHHMM(finalOTMins) : minsToHHMM(finalSTMins)))
                });
            }
        }

        const activeGrandMins = criteria === 'OverTime' ? grandTotalOTMins : (criteria === 'ShortTime' ? grandTotalSTMins : grandTotalOTMins);
        const activeGrandAmount = criteria === 'OverTime' ? grandTotalOTAmount : (criteria === 'ShortTime' ? grandTotalSTAmount : (grandTotalOTAmount - grandTotalSTAmount));

        const totals = {
            totalEmployees: summaryRows.length,
            totalDetailRows: detailRows.length,
            totalWorkedMins: grandTotalWorkedMins,
            totalWorkedHrs: minsToHHMM(grandTotalWorkedMins),
            totalOTMins: grandTotalOTMins,
            totalOTHrs: minsToHHMM(grandTotalOTMins),
            totalOTAmount: grandTotalOTAmount.toFixed(2),
            totalSTMins: grandTotalSTMins,
            totalSTHrs: minsToHHMM(grandTotalSTMins),
            totalSTAmount: grandTotalSTAmount.toFixed(2),
            netAmount: (grandTotalOTAmount - grandTotalSTAmount).toFixed(2),
            activeGrandMins,
            activeGrandHrs: minsToHHMM(activeGrandMins),
            activeGrandAmount: activeGrandAmount.toFixed(2)
        };

        const activeData = viewMode === 'detail' ? detailRows : summaryRows;

        return res.status(200).json({
            success: true,
            criteria,
            viewMode,
            holidays,
            workingDays: divisorDays,
            totalDays: totalDaysInRange,
            data: activeData,
            summaryData: summaryRows,
            detailData: detailRows,
            totals,
            // Backwards compatibility fields
            grandTotalMins: activeGrandMins,
            grandTotalHrs: minsToHHMM(activeGrandMins),
            grandTotalOTHrs: minsToHHMM(grandTotalOTMins),
            grandTotalSTHrs: minsToHHMM(grandTotalSTMins),
            grandTotalWorkedHrs: minsToHHMM(grandTotalWorkedMins),
            grandTotalAmount: activeGrandAmount.toFixed(2)
        });

    } catch (error) {
        console.error('[OvertimeReport] Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
