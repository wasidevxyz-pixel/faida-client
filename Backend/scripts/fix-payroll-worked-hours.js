const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');

// Parse "HH:MM" or "H:MM AM/PM" to minutes
const toMins = (val) => {
    if (!val) return 0;
    const str = String(val).trim().toUpperCase();
    if (['-', '--:--', '00:00', '0:00', ''].includes(str)) return 0;
    const ampm = str.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (ampm) {
        let h = parseInt(ampm[1]);
        const m = parseInt(ampm[2]);
        if (ampm[3] === 'PM' && h < 12) h += 12;
        if (ampm[3] === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }
    if (str.includes(':')) {
        const parts = str.split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    return Math.round(parseFloat(str) * 60) || 0;
};

const decimalToHHMM = (decimal) => {
    const h = Math.floor(decimal);
    const m = Math.round((decimal - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
};

const calcWorkedHours = (attendances) => {
    return attendances.reduce((sum, a) => {
        if (a.displayStatus === 'Absent' || a.displayStatus === 'Leave') return sum;

        let grossMins = 0;

        // STEP 1: Gross worked time
        if (a.workedHrs && !['0:00', '0', '', '-'].includes(String(a.workedHrs).trim())) {
            grossMins = toMins(a.workedHrs);
        } else if (a.checkIn && a.checkOut && !['-', '--:--', '00:00', '0:00', ''].includes(String(a.checkOut).trim())) {
            const raw = toMins(a.checkOut) - toMins(a.checkIn);
            grossMins = raw < 0 ? raw + 1440 : raw;
        } else {
            return sum;
        }

        // STEP 2: Breaks
        let breakMins = 0;
        if (a.breakOut && a.breakIn && !['-', '--:--', ''].includes(String(a.breakIn).trim())) {
            const bIn = toMins(a.breakIn);
            const bOut = toMins(a.breakOut);
            breakMins = bIn - bOut;
            if (breakMins < 0) breakMins += 1440;
        } else if (a.breakHrs && !['0:00', '0', ''].includes(String(a.breakHrs).trim())) {
            breakMins = toMins(a.breakHrs);
        }

        let netMins = grossMins - breakMins;
        if (netMins < 0) netMins = 0;

        // STEP 3: Diffs
        let diffMins = 0;
        if (a.totalDiffHrs && !['0:00', '0', ''].includes(String(a.totalDiffHrs).trim())) {
            diffMins = toMins(a.totalDiffHrs);
        } else if (a.timeDiffIn && a.timeDiffOut &&
            !['-', '--:--', ''].includes(String(a.timeDiffIn).trim()) &&
            !['-', '--:--', ''].includes(String(a.timeDiffOut).trim())) {
            const dIn = toMins(a.timeDiffIn);
            const dOut = toMins(a.timeDiffOut);
            diffMins = dOut - dIn;
            if (diffMins < 0) diffMins += 1440;
        }

        if (!a.diffMode || a.diffMode === '+') netMins += diffMins;
        else netMins -= diffMins;

        if (netMins < 0) netMins = 0;
        return sum + (netMins / 60);
    }, 0);
};

const fixPayrollWorkedHours = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.\n');

        // Get all saved payrolls
        const payrolls = await Payroll.find({}).populate('employee', 'name code dutyHrs totalWdsPerMonth');
        console.log(`Found ${payrolls.length} saved payroll records to fix.\n`);

        let fixed = 0;
        let skipped = 0;
        let errors = 0;

        for (const p of payrolls) {
            try {
                if (!p.employee || !p.monthYear) { skipped++; continue; }

                const [year, month] = p.monthYear.split('-');
                const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

                const attendances = await Attendance.find({
                    employee: p.employee._id || p.employee,
                    date: { $gte: startDate, $lte: endDate }
                });

                if (attendances.length === 0) { skipped++; continue; }

                const workedHrsDecimal = calcWorkedHours(attendances);
                const workedDays = attendances.filter(a =>
                    a.isPresent && a.displayStatus !== 'Absent' && a.displayStatus !== 'Leave'
                ).length;

                // Get employee duty hours
                const emp = await Employee.findById(p.employee._id || p.employee).select('dutyHrs');
                const dutyHrs = emp?.dutyHrs || 8;
                const wdsPerMonth = p.totalWdsPerMonth || 24;
                const totalHrsPerMonth = wdsPerMonth * dutyHrs;
                const shortTimeHrs = Math.max(0, totalHrsPerMonth - workedHrsDecimal);

                const oldWorked = p.workedHrs || 0;
                const diff = Math.abs(oldWorked - workedHrsDecimal);

                if (diff > 0.02) { // Only update if difference > 1 minute
                    const empName = p.employee.name || p.employee;
                    console.log(`${empName} (${p.monthYear}): ${decimalToHHMM(oldWorked)} → ${decimalToHHMM(workedHrsDecimal)}`);

                    p.workedHrs = workedHrsDecimal;
                    p.workedDays = workedDays;
                    p.shortTimeHrs = shortTimeHrs;
                    await p.save();
                    fixed++;
                } else {
                    skipped++;
                }
            } catch (err) {
                console.error(`Error on payroll ${p._id}:`, err.message);
                errors++;
            }
        }

        console.log(`\n✓ Fixed ${fixed} payroll records.`);
        console.log(`  Unchanged: ${skipped}, Errors: ${errors}`);
        process.exit(0);
    } catch (err) {
        console.error('Script Error:', err);
        process.exit(1);
    }
};

fixPayrollWorkedHours();
