/**
 * BULK SAVE ALL ATTENDANCE RECORDS
 * This script does exactly what clicking "Save" on the attendance register does
 * for every employee's current month records.
 * Run this on live server: node Backend/scripts/bulk-save-attendance.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Attendance = require('../models/Attendance');

// Parse "HH:MM" or "H:MM AM/PM" to total minutes
const toMins = (val) => {
    if (!val) return 0;
    const str = String(val).trim().toUpperCase();
    if (['-', '--:--', '00:00', '0:00', ''].includes(str)) return 0;

    // AM/PM format: "8:03 AM", "7:43 PM"
    const ampm = str.match(/^(\d+):(\d+)\s*(AM|PM)$/);
    if (ampm) {
        let h = parseInt(ampm[1]);
        const m = parseInt(ampm[2]);
        if (ampm[3] === 'PM' && h < 12) h += 12;
        if (ampm[3] === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }
    // 24h format: "08:03", "19:43"
    if (str.includes(':')) {
        const parts = str.split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    return 0;
};

// Convert minutes to "HH:MM" string
const toHHMM = (mins) => {
    if (!mins || mins <= 0) return '0:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
};

// Convert "H:MM AM/PM" to 24h "HH:MM"
const to24h = (timeStr) => {
    if (!timeStr) return '';
    const str = String(timeStr).trim();
    if (str.toLowerCase().includes('am') || str.toLowerCase().includes('pm')) {
        const mins = toMins(str);
        if (mins === 0) return '';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return str; // already 24h
};

const run = async () => {
    try {
        console.log('Connecting...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.\n');

        // Process current month AND previous month
        const now = new Date();
        const targets = [
            { year: now.getFullYear(), month: now.getMonth() + 1 },       // current month
            { year: now.getFullYear(), month: now.getMonth() },            // previous month
        ];
        // Remove month 0 (January previous year handling)
        const ranges = targets.filter(t => t.month > 0).map(t => {
            const start = new Date(t.year, t.month - 1, 1);
            const end = new Date(t.year, t.month, 0, 23, 59, 59, 999);
            return { start, end, label: `${t.year}-${String(t.month).padStart(2, '0')}` };
        });

        let totalFixed = 0;

        for (const range of ranges) {
            console.log(`Processing ${range.label}...`);

            // Get ALL attendance records in this month that have checkIn AND checkOut
            const records = await Attendance.find({
                date: { $gte: range.start, $lte: range.end },
                checkIn: { $exists: true, $nin: ['', null, '-', '--:--'] },
                checkOut: { $exists: true, $nin: ['', null, '-', '--:--', '0:00', '00:00'] }
            });

            console.log(`  Found ${records.length} records with checkIn+checkOut`);

            let fixed = 0;
            for (const r of records) {
                try {
                    // Convert checkIn/checkOut to 24h (same as browser HTML time input)
                    const checkIn24 = to24h(r.checkIn);
                    const checkOut24 = to24h(r.checkOut);

                    const inMin = toMins(r.checkIn);
                    const outMin = toMins(r.checkOut);
                    if (inMin === 0 && outMin === 0) continue;

                    // STEP 1: Gross worked hours (checkOut - checkIn)
                    let gross = outMin - inMin;
                    if (gross < 0) gross += 1440; // midnight crossing
                    const workedHrs = toHHMM(gross);

                    // STEP 2: Break hours from breakOut/breakIn
                    let breakMins = 0;
                    let breakHrs = r.breakHrs || '';
                    if (r.breakOut && r.breakIn &&
                        !['-', '--:--', ''].includes(String(r.breakIn).trim()) &&
                        !['-', '--:--', ''].includes(String(r.breakOut).trim())) {
                        const bIn = toMins(r.breakIn);
                        const bOut = toMins(r.breakOut);
                        breakMins = bIn - bOut;
                        if (breakMins < 0) breakMins += 1440;
                        breakHrs = toHHMM(breakMins);
                    } else if (r.breakHrs) {
                        breakMins = toMins(r.breakHrs);
                    }

                    // STEP 3: Diff hours from timeDiffIn/timeDiffOut
                    let diffMins = 0;
                    let totalDiffHrs = r.totalDiffHrs || '';
                    const diffMode = r.diffMode || '+';
                    if (r.timeDiffIn && r.timeDiffOut &&
                        !['-', '--:--', ''].includes(String(r.timeDiffIn).trim()) &&
                        !['-', '--:--', ''].includes(String(r.timeDiffOut).trim())) {
                        const dIn = toMins(r.timeDiffIn);
                        const dOut = toMins(r.timeDiffOut);
                        diffMins = dOut - dIn;
                        if (diffMins < 0) diffMins += 1440;
                        totalDiffHrs = toHHMM(diffMins);
                    } else if (r.totalDiffHrs) {
                        diffMins = toMins(r.totalDiffHrs);
                    }

                    // STEP 4: Net total hours (same as attendance register TOTAL HOURS column)
                    let netMins = gross - breakMins;
                    if (netMins < 0) netMins = 0;
                    if (diffMode === '+') netMins += diffMins;
                    else netMins -= diffMins;
                    if (netMins < 0) netMins = 0;

                    const totalHrs = netMins / 60;

                    // Write back to DB - exactly what saveAllVisible does
                    r.checkIn = checkIn24;
                    r.checkOut = checkOut24;
                    r.workedHrs = workedHrs;
                    r.breakHrs = breakHrs;
                    r.totalDiffHrs = totalDiffHrs;
                    r.totalHrs = totalHrs;
                    if (!r.isPresent) r.isPresent = true;
                    if (!r.displayStatus) r.displayStatus = 'Present';

                    await r.save();
                    fixed++;
                } catch (err) {
                    console.error(`  Error on record ${r._id}:`, err.message);
                }
            }
            console.log(`  Fixed ${fixed} records in ${range.label}\n`);
            totalFixed += fixed;
        }

        console.log(`\n✓ DONE. Total records updated: ${totalFixed}`);
        console.log('Now open any employee payroll - worked hours will be correct.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

run();
