const mongoose = require('mongoose');

const LegacyPayrollSchema = new mongoose.Schema({
    employeeCode: {
        type: String,
        required: true,
        index: true
    },
    employeeName: {
        type: String,
        required: true
    },
    monthYear: {
        type: String, // e.g., "November 2025"
        required: true,
        index: true
    },
    salaryDate: {
        type: Date,
        index: true
    },
    branch: {
        type: String,
        required: true,
        index: true
    },
    department: String,
    designation: String,
    dutyHrs: Number,
    
    // Earnings
    basicSalary: { type: Number, default: 0 },
    overTime: { type: Number, default: 0 },
    stLessAllowance: { type: Number, default: 0 },
    fixAllowance: { type: Number, default: 0 },
    monthlyCommission: { type: Number, default: 0 },
    ugComm: { type: Number, default: 0 },
    warehouseComm: { type: Number, default: 0 },
    otherEarning: { type: Number, default: 0 },
    otherAllowance: { type: Number, default: 0 },
    breakfastRoti: { type: Number, default: 0 },
    homeAllowance: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    bankPaid: { type: Number, default: 0 },
    
    // Deductions
    shortTime: { type: Number, default: 0 },
    mess: { type: Number, default: 0 },
    preMonthBalance: { type: Number, default: 0 },
    currentAdvance: { type: Number, default: 0 },
    advanceDeduction: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    otherDeductionPenalty: { type: Number, default: 0 },
    salaryWHT: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
    cashPaid: { type: Number, default: 0 },
    
    netSalary: { type: Number, default: 0 },
    paidVia: String,
    
    // PDF Reference
    sourceFile: String,
    pageNumber: Number,
    slipHalf: { type: String, enum: ['top', 'bottom', null], default: null }, // which half of the page
    
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for quick searching by employee and month
LegacyPayrollSchema.index({ employeeCode: 1, monthYear: 1 }, { unique: true });

// Index for fast name search (regex queries)
LegacyPayrollSchema.index({ employeeName: 1 });

// Compound index for the most common filter: branch + date range
LegacyPayrollSchema.index({ branch: 1, salaryDate: 1 });
LegacyPayrollSchema.index({ branch: 1, monthYear: 1 });

module.exports = mongoose.model('LegacyPayroll', LegacyPayrollSchema);
