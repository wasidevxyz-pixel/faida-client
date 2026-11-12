const mongoose = require('mongoose');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const { applyBranchFilter } = require('../middleware/auth');
const xlsx = require('xlsx');

// Helper: Count off-days/Sundays in a month so holidays never defaults to 0
const countMonthHolidays = (monthYear, offDay = 'Sunday') => {
    if (!monthYear || !monthYear.includes('-')) return 4;
    const [y, m] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let count = 0;
    const targetDay = (offDay || 'Sunday').trim().toLowerCase();
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m - 1, d);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        if (dayName === targetDay) count++;
    }
    return count || 4;
};

// Helper: Convert decimal hours to HH:MM format
const decimalToTimeStr = (decimal) => {
    if (!decimal || isNaN(decimal) || decimal <= 0) return '0:00';
    const hrs = Math.floor(decimal);
    const mins = Math.round((decimal - hrs) * 60);
    return `${hrs}:${mins.toString().padStart(2, '0')}`;
};

// Helper: Build flexible regex for branch matching
const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', '', 'null'].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

/**
 * @desc    Get Employee Short Week (TSW) Deduction Report
 * @route   GET /api/v1/reports/short-week
 * @access  Private
 */
exports.getShortWeekReport = async (req, res) => {
    try {
        const {
            monthYear,
            fromMonth,
            toMonth,
            branch,
            department,
            designation,
            employee,
            code,
            onlyShortWeek = 'true',
            tswFilter = 'only_short_week', // 'all' | 'only_short_week' | '1' | '2' | '3' | '4_plus'
            groupBy = 'none' // 'none' | 'branch' | 'department' | 'designation'
        } = req.query;

        let query = {
            // Strictly exclude Excel import-only payrolls and import dummy codes
            isImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        };

        // Month filter handling
        if (monthYear && monthYear !== 'all' && monthYear !== '') {
            query.monthYear = monthYear;
        } else if (fromMonth && toMonth) {
            query.monthYear = { $gte: fromMonth, $lte: toMonth };
        } else if (fromMonth) {
            query.monthYear = { $gte: fromMonth };
        } else if (toMonth) {
            query.monthYear = { $lte: toMonth };
        }

        // Branch filter with security restriction
        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            query.branch = branch.toString().trim();
        }
        query = await applyBranchFilter(req, query, Payroll);

        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            if (query.branch !== '__NOT_ALLOWED_BRANCH__' && !Array.isArray(query.branch?.$in)) {
                const bRegex = makeBranchRegex(branch);
                if (bRegex) query.branch = bRegex;
            }
        }

        if (department && department !== 'all' && department !== 'All Departments') {
            query.department = department;
        }
        if (designation && designation !== 'all' && designation !== 'All Designations') {
            query.designation = designation;
        }
        if (employee && employee !== '') {
            query.employee = employee;
        }
        if (code && code.trim() !== '') {
            query.code = new RegExp(code.trim(), 'i');
        }

        const payrolls = await Payroll.find(query)
            .populate({
                path: 'employee',
                select: 'name code department designation phone joinDate active',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'designation', select: 'name' }
                ]
            })
            .sort({ monthYear: -1, branch: 1, department: 1, code: 1 })
            .lean();

        let reportRows = [];
        let totals = {
            totalPayrollsExamined: payrolls.length,
            totalEmployeesWithShortWeek: 0,
            totalShortWeekDays: 0,
            totalExtraShortHrs: 0,
            totalBaseShortHrs: 0,
            totalActualShortHrs: 0,
            totalExtraShortDeduction: 0,
            grandTotalShortDeduction: 0,
            totalBasicSalary: 0,
            totalNetSalary: 0,
            totalAllowedHolidays: 0,
            totalHolidays: 0,
            totalAbsents: 0
        };

        payrolls.forEach(p => {
            const dutyHrs = p.totalHrsPerDay || 8;
            const reqHrs = p.totalHrsPerMonth || (p.totalWdsPerMonth ? p.totalWdsPerMonth * dutyHrs : 0);
            const workedHrs = p.workedHrs || 0;
            const baseShortHrs = Math.max(0, reqHrs - workedHrs);
            const actualShortHrs = p.shortTimeHrs || 0;
            const extraShortHrs = Math.max(0, actualShortHrs - baseShortHrs);

            // Monthly Allowed Holidays (Leaves allowed per month, never 0)
            const allowedHolidays = (typeof p.allowedLeaves === 'number' && p.allowedLeaves > 0)
                ? p.allowedLeaves
                : ((p.totalDays && p.totalWdsPerMonth && (p.totalDays > p.totalWdsPerMonth))
                    ? (p.totalDays - p.totalWdsPerMonth)
                    : countMonthHolidays(p.monthYear, p.offDay || 'Sunday'));

            // Employee Monthly Absent Days
            const absents = (typeof p.totalAbsents === 'number') ? p.totalAbsents : 0;

            // TSW Short Week Days: check explicitly stored value, or ttw, or derive from extraShortHrs / dutyHrs
            let shortWeekDays = 0;
            if (typeof p.shortWeekDays === 'number' && p.shortWeekDays > 0) {
                shortWeekDays = p.shortWeekDays;
            } else if (typeof p.ttw === 'number' && p.ttw > 0) {
                shortWeekDays = p.ttw;
            } else if (extraShortHrs > 0.1) {
                shortWeekDays = Math.round(extraShortHrs / dutyHrs);
            }

            const isShortWeekApplied = (p.isShortWeek === true) || (shortWeekDays > 0) || (extraShortHrs > 0.1);

            // Rate per hour for OT/ST is calculated on standard fixed 30-day basis
            const hourlyRate = (p.perMonth || 0) / 30 / dutyHrs;
            const extraShortDeduction = Math.round((shortWeekDays * dutyHrs) * hourlyRate);
            const totalShortDeduction = p.shortWeek || p.shortTimeAmount || Math.round(actualShortHrs * hourlyRate);

            if (isShortWeekApplied) {
                totals.totalEmployeesWithShortWeek++;
                totals.totalShortWeekDays += shortWeekDays;
                totals.totalExtraShortHrs += (shortWeekDays * dutyHrs);
                totals.totalExtraShortDeduction += extraShortDeduction;
            }

            totals.totalBaseShortHrs += baseShortHrs;
            totals.totalActualShortHrs += actualShortHrs;
            totals.grandTotalShortDeduction += totalShortDeduction;
            totals.totalBasicSalary += (p.perMonth || 0);
            totals.totalNetSalary += (p.netTotal || 0);
            totals.totalAllowedHolidays += allowedHolidays;
            totals.totalHolidays += allowedHolidays;
            totals.totalAbsents += absents;

            // Apply Short Week Filter (TSW days criteria)
            if (tswFilter === '1') {
                if (shortWeekDays !== 1) return;
            } else if (tswFilter === '2') {
                if (shortWeekDays !== 2) return;
            } else if (tswFilter === '3') {
                if (shortWeekDays !== 3) return;
            } else if (tswFilter === '4_plus') {
                if (shortWeekDays < 4) return;
            } else if (tswFilter === 'only_short_week' || onlyShortWeek === 'true') {
                if (!isShortWeekApplied || shortWeekDays <= 0) return;
            }

            const deptName = p.department || p.employee?.department?.name || 'N/A';
            const desigName = p.designation || p.employee?.designation?.name || 'N/A';
            const branchName = p.branch || 'Unknown';

            reportRows.push({
                _id: p._id,
                payrollId: p._id.toString().slice(-6).toUpperCase(),
                monthYear: p.monthYear,
                branch: branchName,
                employeeId: p.employee?._id,
                code: p.code || p.employee?.code || 'N/A',
                employeeName: p.employee?.name || 'Unknown',
                department: deptName,
                designation: desigName,
                basicSalary: p.perMonth || 0,
                dutyHrs: dutyHrs,
                totalDays: p.totalDays || 30,
                totalWdsPerMonth: p.totalWdsPerMonth || 0,
                allowedHolidays: allowedHolidays,
                holidays: allowedHolidays,
                absents: absents,
                totalAbsents: absents,
                requiredHrs: reqHrs,
                requiredHrsStr: decimalToTimeStr(reqHrs),
                workedHrs: workedHrs,
                workedHrsStr: decimalToTimeStr(workedHrs),
                baseShortHrs: parseFloat(baseShortHrs.toFixed(2)),
                baseShortHrsStr: decimalToTimeStr(baseShortHrs),
                actualShortHrs: parseFloat(actualShortHrs.toFixed(2)),
                actualShortHrsStr: decimalToTimeStr(actualShortHrs),
                shortWeekDays: shortWeekDays,
                extraShortHrs: shortWeekDays * dutyHrs,
                extraShortHrsStr: decimalToTimeStr(shortWeekDays * dutyHrs),
                hourlyRate: parseFloat(hourlyRate.toFixed(2)),
                extraShortDeduction: extraShortDeduction,
                totalShortDeduction: totalShortDeduction,
                grossTotal: p.grossTotal || 0,
                netTotal: p.netTotal || 0,
                isShortWeek: isShortWeekApplied
            });
        });

        // Group rows if requested
        let groupedData = null;
        if (groupBy && groupBy !== 'none') {
            groupedData = {};
            reportRows.forEach(r => {
                let groupKey = 'Other';
                if (groupBy === 'branch') groupKey = r.branch || 'Unknown Branch';
                else if (groupBy === 'department') groupKey = r.department || 'Unknown Department';
                else if (groupBy === 'designation') groupKey = r.designation || 'Unknown Designation';

                if (!groupedData[groupKey]) {
                    groupedData[groupKey] = {
                        groupName: groupKey,
                        items: [],
                        groupTotals: {
                            count: 0,
                            totalBasic: 0,
                            totalAllowedHolidays: 0,
                            totalHolidays: 0,
                            totalAbsents: 0,
                            totalTSWDays: 0,
                            totalExtraShortHrs: 0,
                            totalExtraDeduction: 0,
                            totalShortDeduction: 0,
                            totalNet: 0
                        }
                    };
                }

                groupedData[groupKey].items.push(r);
                groupedData[groupKey].groupTotals.count++;
                groupedData[groupKey].groupTotals.totalBasic += r.basicSalary;
                groupedData[groupKey].groupTotals.totalAllowedHolidays += (r.allowedHolidays || 0);
                groupedData[groupKey].groupTotals.totalHolidays += (r.allowedHolidays || 0);
                groupedData[groupKey].groupTotals.totalAbsents += (r.absents || 0);
                groupedData[groupKey].groupTotals.totalTSWDays += r.shortWeekDays;
                groupedData[groupKey].groupTotals.totalExtraShortHrs += r.extraShortHrs;
                groupedData[groupKey].groupTotals.totalExtraDeduction += r.extraShortDeduction;
                groupedData[groupKey].groupTotals.totalShortDeduction += r.totalShortDeduction;
                groupedData[groupKey].groupTotals.totalNet += r.netTotal;
            });
        }

        // Summary metric formatting
        totals.totalExtraShortHrs = parseFloat(totals.totalExtraShortHrs.toFixed(2));
        totals.totalExtraShortHrsStr = decimalToTimeStr(totals.totalExtraShortHrs);
        totals.totalBaseShortHrs = parseFloat(totals.totalBaseShortHrs.toFixed(2));
        totals.totalBaseShortHrsStr = decimalToTimeStr(totals.totalBaseShortHrs);
        totals.totalActualShortHrs = parseFloat(totals.totalActualShortHrs.toFixed(2));
        totals.totalActualShortHrsStr = decimalToTimeStr(totals.totalActualShortHrs);

        res.status(200).json({
            success: true,
            count: reportRows.length,
            groupBy,
            groupedData,
            totals,
            data: reportRows
        });

    } catch (err) {
        console.error('[ShortWeekReport Error]:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc    Export Employee Short Week Report to Excel (.xlsx)
 * @route   GET /api/v1/reports/short-week/export
 * @access  Private
 */
exports.exportShortWeekReport = async (req, res) => {
    try {
        const {
            monthYear,
            fromMonth,
            toMonth,
            branch,
            department,
            designation,
            employee,
            code,
            onlyShortWeek = 'true',
            tswFilter = 'only_short_week',
            groupBy = 'none'
        } = req.query;

        let query = {
            isImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        };

        if (monthYear && monthYear !== 'all' && monthYear !== '') {
            query.monthYear = monthYear;
        } else if (fromMonth && toMonth) {
            query.monthYear = { $gte: fromMonth, $lte: toMonth };
        } else if (fromMonth) {
            query.monthYear = { $gte: fromMonth };
        } else if (toMonth) {
            query.monthYear = { $lte: toMonth };
        }

        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            query.branch = branch.toString().trim();
        }
        query = await applyBranchFilter(req, query, Payroll);

        if (branch && branch !== 'all' && branch !== '' && branch !== 'null') {
            if (query.branch !== '__NOT_ALLOWED_BRANCH__' && !Array.isArray(query.branch?.$in)) {
                const bRegex = makeBranchRegex(branch);
                if (bRegex) query.branch = bRegex;
            }
        }

        if (department && department !== 'all' && department !== 'All Departments') query.department = department;
        if (designation && designation !== 'all' && designation !== 'All Designations') query.designation = designation;
        if (employee && employee !== '') query.employee = employee;
        if (code && code.trim() !== '') query.code = new RegExp(code.trim(), 'i');

        const payrolls = await Payroll.find(query)
            .populate('employee', 'name code department designation')
            .sort({ monthYear: -1, branch: 1, department: 1, code: 1 })
            .lean();

        const excelData = [];
        let sNo = 1;

        payrolls.forEach(p => {
            const dutyHrs = p.totalHrsPerDay || 8;
            const reqHrs = p.totalHrsPerMonth || (p.totalWdsPerMonth ? p.totalWdsPerMonth * dutyHrs : 0);
            const workedHrs = p.workedHrs || 0;
            const baseShortHrs = Math.max(0, reqHrs - workedHrs);
            const actualShortHrs = p.shortTimeHrs || 0;
            const extraShortHrs = Math.max(0, actualShortHrs - baseShortHrs);

            const allowedHolidays = (typeof p.allowedLeaves === 'number' && p.allowedLeaves > 0)
                ? p.allowedLeaves
                : ((p.totalDays && p.totalWdsPerMonth && (p.totalDays > p.totalWdsPerMonth))
                    ? (p.totalDays - p.totalWdsPerMonth)
                    : countMonthHolidays(p.monthYear, p.offDay || 'Sunday'));

            const absents = (typeof p.totalAbsents === 'number') ? p.totalAbsents : 0;

            let shortWeekDays = 0;
            if (typeof p.shortWeekDays === 'number' && p.shortWeekDays > 0) {
                shortWeekDays = p.shortWeekDays;
            } else if (typeof p.ttw === 'number' && p.ttw > 0) {
                shortWeekDays = p.ttw;
            } else if (extraShortHrs > 0.1) {
                shortWeekDays = Math.round(extraShortHrs / dutyHrs);
            }

            const isShortWeekApplied = (p.isShortWeek === true) || (shortWeekDays > 0) || (extraShortHrs > 0.1);
            const hourlyRate = (p.perMonth || 0) / 30 / dutyHrs;
            const extraShortDeduction = Math.round((shortWeekDays * dutyHrs) * hourlyRate);
            const totalShortDeduction = p.shortWeek || p.shortTimeAmount || Math.round(actualShortHrs * hourlyRate);

            if (tswFilter === '1') {
                if (shortWeekDays !== 1) return;
            } else if (tswFilter === '2') {
                if (shortWeekDays !== 2) return;
            } else if (tswFilter === '3') {
                if (shortWeekDays !== 3) return;
            } else if (tswFilter === '4_plus') {
                if (shortWeekDays < 4) return;
            } else if (tswFilter === 'only_short_week' || onlyShortWeek === 'true') {
                if (!isShortWeekApplied || shortWeekDays <= 0) return;
            }

            excelData.push({
                'S.No': sNo++,
                'Month': p.monthYear,
                'Branch': p.branch || '-',
                'Emp Code': p.code || p.employee?.code || '-',
                'Employee Name': p.employee?.name || '-',
                'Department': p.department || p.employee?.department?.name || '-',
                'Designation': p.designation || p.employee?.designation?.name || '-',
                'Basic Salary': p.perMonth || 0,
                'Duty Hrs/Day': dutyHrs,
                'Allowed Holidays': allowedHolidays,
                'Absent Days': absents,
                'Extra Day Ded': shortWeekDays,
                'Req. Hrs': decimalToTimeStr(reqHrs),
                'Worked Hrs': decimalToTimeStr(workedHrs),
                'Base Short (Hrs)': decimalToTimeStr(baseShortHrs),
                'Extra Short (Hrs)': decimalToTimeStr(shortWeekDays * dutyHrs),
                'Total Short (Hrs)': decimalToTimeStr(actualShortHrs),
                'Rate / Hr': parseFloat(hourlyRate.toFixed(2)),
                'TSW Extra Ded (Rs)': extraShortDeduction,
                'Total Short Ded (Rs)': totalShortDeduction,
                'Net Salary (Rs)': p.netTotal || 0
            });
        });

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(excelData);
        xlsx.utils.book_append_sheet(wb, ws, 'ShortWeek_TSW_Report');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `ShortWeek_TSW_Report_${monthYear || 'All'}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (err) {
        console.error('[ShortWeekReport Export Error]:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
