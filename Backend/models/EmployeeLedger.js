const mongoose = require('mongoose');

const EmployeeLedgerSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        enum: ['Advance', 'Return', 'Adjustment', 'Payroll'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    debit: {
        type: Number,
        default: 0 // Increases Balance (Loan taken)
    },
    credit: {
        type: Number,
        default: 0 // Decreases Balance (Repayment/Deduction)
    },
    balance: {
        type: Number,
        default: 0 // Running Balance
    },
    referenceModel: {
        type: String,
        enum: ['EmployeeAdvance', 'EmployeeAdjustment', 'Payroll', 'Opening'],
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    branch: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Index for efficient retrieval
EmployeeLedgerSchema.index({ employee: 1, date: 1 });

module.exports = mongoose.model('EmployeeLedger', EmployeeLedgerSchema);
