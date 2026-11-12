const mongoose = require('mongoose');

const employeeAdvanceSchema = new mongoose.Schema({
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
        default: 'Select Branch'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    payroll: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payroll'
    },
    transactionType: {
        type: String,
        enum: ['Pay', 'Received'],
        default: 'Pay'
    },
    code: String,
    preMonthBal: {
        type: Number,
        default: 0
    },
    currentMonthBal: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        default: 0
    },
    salary: {
        type: Number,
        default: 0
    },
    paid: {
        type: Number,
        default: 0
    },
    balance: {
        type: Number,
        default: 0
    },
    docMode: {
        type: String,
        enum: ['Cash', 'Bank'],
        default: 'Cash'
    },
    remarks: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    preMonthInstallment: {
        preBal: { type: Number, default: 0 },
        installment: { type: Number, default: 0 },
        balance: { type: Number, default: 0 }
    },
    currentMonthInstallment: {
        preBal: { type: Number, default: 0 },
        installment: { type: Number, default: 0 },
        balance: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

employeeAdvanceSchema.index({ employee: 1, date: -1 });
employeeAdvanceSchema.index({ branch: 1, date: -1 });
employeeAdvanceSchema.index({ date: -1 });
employeeAdvanceSchema.index({ transactionType: 1 });

module.exports = mongoose.model('EmployeeAdvance', employeeAdvanceSchema);
