const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    branch: {
        type: String,
        default: 'F-6'
    },
    code: String,
    busyHours: {
        type: Number,
        default: 12
    },
    // Check In/Out Times
    checkIn: String,
    checkOut: String,
    workedHrs: String,
    breakOut: String,
    breakIn: String,
    breakHrs: String,
    // Time Differences
    timeDiffIn: String,
    timeDiffOut: String,
    diffMode: {
        type: String,
        enum: ['+', '-'],
        default: '+'
    },
    totalDiffHrs: String,
    totalHrs: {
        type: Number,
        default: 0
    },
    // Display Status
    displayStatus: {
        type: String,
        enum: ['Present', 'Absent', 'Leave', 'Half Day'],
        default: 'Present'
    },
    remarks: String,
    verificationMethod: {
        type: String,
        enum: ['FINGERPRINT', 'FACE_AI', 'MANUAL'],
        default: 'FINGERPRINT',
        index: true
    },
    isPresent: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// AUTOMATE CALCULATION: Pre-save middleware to ensure times are always calculated before saving to DB
attendanceSchema.pre('save', async function () {
    const toMins = (val, isMidnightAllowed = false) => {
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
            // Treat 12:00 AM (midnight = 0 mins) as end-of-day (1440 mins) when used as checkout
            if (result === 0 && isMidnightAllowed) return 1440;
            return result;
        }
        if (str.includes(':')) {
            const parts = str.split(':').map(Number);
            const result = (parts[0] || 0) * 60 + (parts[1] || 0);
            // Treat 00:00 as end-of-day (1440 mins) when used as checkout
            if (result === 0 && isMidnightAllowed) return 1440;
            return result;
        }
        return 0;
    };

    const toHHMM = (mins) => {
        if (!mins || mins <= 0) return '0:00';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}:${String(m).padStart(2, '0')}`;
    };

    const to24h = (timeStr) => {
        if (!timeStr) return '';
        const str = String(timeStr).trim();
        if (str.toLowerCase().includes('am') || str.toLowerCase().includes('pm')) {
            const mins = toMins(str);
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        // If it's already in 24h format but might be "0:00", standardize it to "00:00"
        if (str.includes(':')) {
            const [h, m] = str.split(':').map(Number);
            return `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        }
        return str;
    };

    // Only process if it's marked as Present (Absent records should have 0/empty hrs)
    if (!['Present', 'P', 'Half Day'].includes(this.displayStatus)) {
        // Safe reset if marked as Absent
        if (this.displayStatus === 'Absent') {
            this.workedHrs = '';
            this.totalHrs = 0;
            this.isPresent = false;
        }
        return; // async: just return, no next() needed
    }

    // Standardize check-in/out to 24h format
    if (this.checkIn) this.checkIn = to24h(this.checkIn);
    if (this.checkOut) this.checkOut = to24h(this.checkOut);

    const inMin = toMins(this.checkIn);
    const outMin = toMins(this.checkOut, true); // true = treat 00:00 midnight as 1440 (end of day)

    if (inMin > 0 && outMin > 0) {
        // 1. Gross Worked Hours
        let grossMins = outMin - inMin;
        if (outMin > 0 && grossMins < 0) grossMins += 1440; // Handle overnight shifts
        this.workedHrs = toHHMM(grossMins);

        // 2. Break Hours
        let breakMins = 0;
        if (this.breakOut && this.breakIn && !['-', '--:--', ''].includes(String(this.breakIn).trim())) {
            const bIn = toMins(this.breakIn);
            const bOut = toMins(this.breakOut);
            breakMins = bIn - bOut;
            if (breakMins < 0) breakMins += 1440;
            this.breakHrs = toHHMM(breakMins);
        }

        // 3. Difference (OT/Shortage Compensation)
        let diffMins = 0;
        if (this.timeDiffIn && this.timeDiffOut && !['-', '--:--', ''].includes(String(this.timeDiffIn).trim())) {
            const dIn = toMins(this.timeDiffIn);
            const dOut = toMins(this.timeDiffOut);
            diffMins = dOut - dIn;
            if (diffMins < 0) diffMins += 1440;
            this.totalDiffHrs = toHHMM(diffMins);
        }

        // 4. Net Total Hours (This is what Payroll screen uses)
        let netMins = grossMins - breakMins;
        if (this.diffMode === '-') netMins -= diffMins;
        else netMins += diffMins;
        if (netMins < 0) netMins = 0;

        this.totalHrs = netMins / 60;
        this.isPresent = true;
    }
    // async: no next() call needed - Mongoose resolves automatically
});

// Compound index for employee and date
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
// Additional indexes for fast dashboard queries
attendanceSchema.index({ branch: 1, date: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ employee: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
