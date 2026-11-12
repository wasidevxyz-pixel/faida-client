const mongoose = require('mongoose');

const advanceAttendanceReconciliationSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    branch: {
        type: String,
        required: true,
        default: 'F-6'
    },
    // Baseline Advance Timing (Previously recorded)
    advanceCheckIn: {
        type: String,
        default: ''
    },
    advanceCheckOut: {
        type: String,
        default: ''
    },
    advanceHours: {
        type: Number,
        default: 0
    },
    advanceHoursFormatted: {
        type: String,
        default: '0:00'
    },
    advanceStatus: {
        type: String,
        enum: ['Present', 'Absent', 'Leave', 'Half Day', 'Off Day', 'Holiday'],
        default: 'Present'
    },
    // Haqeeqi Actual Timing (Entered / Verified by user)
    actualCheckIn: {
        type: String,
        default: ''
    },
    actualCheckOut: {
        type: String,
        default: ''
    },
    actualHours: {
        type: Number,
        default: 0
    },
    actualHoursFormatted: {
        type: String,
        default: '0:00'
    },
    actualStatus: {
        type: String,
        enum: ['Present', 'Absent', 'Leave', 'Half Day', 'Off Day', 'Holiday'],
        default: 'Present'
    },
    // Difference (+ = Overtime / Extra, - = Short Time / Less worked)
    diffMinutes: {
        type: Number,
        default: 0
    },
    diffHoursFormatted: {
        type: String,
        default: '0:00'
    },
    diffMode: {
        type: String,
        enum: ['+', '-'],
        default: '+'
    },
    remarks: {
        type: String,
        default: ''
    },
    // Reconciliation Period Anchor (e.g. 2026-10-24 to 2026-10-31)
    periodFrom: {
        type: Date
    },
    periodTo: {
        type: Date
    },
    isAppliedToPayroll: {
        type: Boolean,
        default: false
    },
    appliedMonthYear: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Unique compound index so one employee has at most one reconciliation record per day
advanceAttendanceReconciliationSchema.index({ employee: 1, date: 1 }, { unique: true });
advanceAttendanceReconciliationSchema.index({ branch: 1, date: 1 });
advanceAttendanceReconciliationSchema.index({ date: 1 });

module.exports = mongoose.model('AdvanceAttendanceReconciliation', advanceAttendanceReconciliationSchema);
