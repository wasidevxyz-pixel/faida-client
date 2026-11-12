const mongoose = require('mongoose');

const EmployeeAdjustmentSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    type: { // The dropdown label says "Pay", might be Type of adjustment
        type: String,
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    preBal: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }, // "Paid" vs "Amount"? Image says "Paid" in one column, "Amount" in grid
    balance: { type: Number, default: 0 },
    remarks: String,

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

EmployeeAdjustmentSchema.index({ employee: 1, date: -1 });
EmployeeAdjustmentSchema.index({ branch: 1, date: -1 });
EmployeeAdjustmentSchema.index({ date: -1 });

module.exports = mongoose.model('EmployeeAdjustment', EmployeeAdjustmentSchema);
