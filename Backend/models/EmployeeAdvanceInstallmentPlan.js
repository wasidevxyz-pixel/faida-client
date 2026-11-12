const mongoose = require('mongoose');

const employeeAdvanceInstallmentPlanSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    branch: {
        type: String,
        default: ''
    },
    monthYear: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
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

employeeAdvanceInstallmentPlanSchema.index({ employee: 1, monthYear: 1 }, { unique: true });
employeeAdvanceInstallmentPlanSchema.index({ employee: 1, date: -1 });

module.exports = mongoose.model('EmployeeAdvanceInstallmentPlan', employeeAdvanceInstallmentPlanSchema);
