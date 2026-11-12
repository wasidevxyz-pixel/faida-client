const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI;
const Attendance = require('../models/Attendance');

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

const fmtHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
};

const fixAttendance = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(mongoUri);
        console.log('Connected.');

        // Find ALL records that have checkIn AND checkOut
        const records = await Attendance.find({
            checkIn: { $exists: true, $nin: ['', null, '-', '--:--'] },
            checkOut: { $exists: true, $nin: ['', null, '-', '--:--'] }
        });

        console.log(`Found ${records.length} records to process.`);

        let fixed = 0;
        let unchanged = 0;

        for (const r of records) {
            try {
                let changed = false;
                const inMin = toMins(r.checkIn);
                const outMin = toMins(r.checkOut);
                if (inMin === 0 && outMin === 0) { unchanged++; continue; }

                // STEP 1: Ensure workedHrs is set (gross = checkOut - checkIn)
                let gross = outMin - inMin;
                if (gross < 0) gross += 1440;
                const workedHrsStr = fmtHHMM(gross);
                if (!r.workedHrs || ['0:00', '0', '', '-'].includes(String(r.workedHrs).trim())) {
                    r.workedHrs = workedHrsStr;
                    changed = true;
                }

                // STEP 2: Ensure breakHrs is set if breakOut/breakIn exist
                let breakMins = 0;
                if (r.breakOut && r.breakIn &&
                    !['-', '--:--', ''].includes(String(r.breakIn).trim()) &&
                    !['-', '--:--', ''].includes(String(r.breakOut).trim())) {

                    const bIn = toMins(r.breakIn);
                    const bOut = toMins(r.breakOut);
                    breakMins = bIn - bOut;
                    if (breakMins < 0) breakMins += 1440;

                    if (!r.breakHrs || r.breakHrs === '' || r.breakHrs === '0:00') {
                        r.breakHrs = fmtHHMM(breakMins);
                        changed = true;
                    }
                } else if (r.breakHrs && !['0:00', '0', ''].includes(String(r.breakHrs).trim())) {
                    breakMins = toMins(r.breakHrs);
                }

                // STEP 3: Ensure totalDiffHrs is set if timeDiffIn/timeDiffOut exist
                let diffMins = 0;
                if (r.timeDiffIn && r.timeDiffOut &&
                    !['-', '--:--', ''].includes(String(r.timeDiffIn).trim()) &&
                    !['-', '--:--', ''].includes(String(r.timeDiffOut).trim())) {

                    const dIn = toMins(r.timeDiffIn);
                    const dOut = toMins(r.timeDiffOut);
                    diffMins = dOut - dIn;
                    if (diffMins < 0) diffMins += 1440;

                    if (!r.totalDiffHrs || r.totalDiffHrs === '' || r.totalDiffHrs === '0:00') {
                        r.totalDiffHrs = fmtHHMM(diffMins);
                        changed = true;
                    }
                } else if (r.totalDiffHrs && !['0:00', '0', ''].includes(String(r.totalDiffHrs).trim())) {
                    diffMins = toMins(r.totalDiffHrs);
                }

                // STEP 4: Calculate final totalHrs (net after breaks and diffs)
                let net = gross - breakMins;
                if (net < 0) net = 0;
                if (!r.diffMode || r.diffMode === '+') net += diffMins;
                else net -= diffMins;
                if (net < 0) net = 0;

                const newTotalHrs = net / 60;

                // Update totalHrs if it differs significantly (more than 1 min)
                if (!r.totalHrs || Math.abs(r.totalHrs - newTotalHrs) > (1 / 60)) {
                    r.totalHrs = newTotalHrs;
                    changed = true;
                }

                if (!r.isPresent && r.displayStatus !== 'Absent' && r.displayStatus !== 'Leave') {
                    r.isPresent = true;
                    changed = true;
                }

                if (changed) {
                    await r.save();
                    fixed++;
                    if (fixed % 50 === 0) console.log(`Fixed ${fixed} records...`);
                } else {
                    unchanged++;
                }
            } catch (err) {
                console.error(`Error on record ${r._id}:`, err.message);
            }
        }

        console.log(`\nDONE. Updated ${fixed} records. Unchanged: ${unchanged}.`);
        process.exit(0);
    } catch (err) {
        console.error('Script Error:', err);
        process.exit(1);
    }
};

fixAttendance();
