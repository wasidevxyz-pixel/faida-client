const mongoose = require('mongoose');

const PayrollSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    monthYear: {
        type: String,
        required: true // Format: "YYYY-MM"
    },
    branch: {
        type: String,
        required: true
    },

    // Employee Profile Info
    code: String,
    bank: String,
    department: String,
    designation: String,
    residency: String,
    totalDays: { type: Number, default: 0 },
    totalWdsPerMonth: { type: Number, default: 0 },
    totalWdsPerMonthHrs: { type: Number, default: 0 },
    totalHrsPerMonth: { type: Number, default: 0 },
    totalHrsPerDay: { type: Number, default: 0 },
    perMonth: { type: Number, default: 0 },
    offDay: { type: String, default: '' },
    totalPerDay: { type: Number, default: 0 },
    totalPerHr: { type: Number, default: 0 },
    salaryPer: { type: Number, default: 0 },
    workedHrs: { type: Number, default: 0 },
    workedDays: { type: Number, default: 0 },

    // Earnings
    overTime: { type: Number, default: 0 },
    rent: { type: Number, default: 0 },
    natin: { type: Number, default: 0 },
    monthlyComm: { type: Number, default: 0 },
    ugComm: { type: Number, default: 0 },
    warehouseComm: { type: Number, default: 0 },
    teaAllowance: { type: Number, default: 0 },
    nashtaDays: { type: Number, default: 0 },
    stLateAllow: { type: Number, default: 0 },
    otherAllow: { type: Number, default: 0 },
    rotiDays: { type: Number, default: 0 },
    earningsTotal: { type: Number, default: 0 },

    // Deductions
    overTimeHrs: { type: Number, default: 0 },
    shortTimeHrs: { type: Number, default: 0 },
    shortTimeAmount: { type: Number, default: 0 },
    ttw: { type: Number, default: 0 },
    fund: { type: Number, default: 0 },
    ugrm: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
    penalty: { type: Number, default: 0 },
    food: { type: Number, default: 0 }, // Food Rate per Time
    ebDeduction: { type: Number, default: 0 }, // Total EB/Food Deduction
    otherDeduction: { type: Number, default: 0 },
    umrahDeduction: { type: Number, default: 0 },
    deductionsTotal: { type: Number, default: 0 },

    // Net Calculation
    grossTotal: { type: Number, default: 0 },
    csMale: { type: Number, default: 0 },
    pAAdv: { type: Number, default: 0 },
    pmAdvRec: { type: Number, default: 0 },
    cmAdvRec: { type: Number, default: 0 },
    totalAdvRec: { type: Number, default: 0 },
    totalAdv: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    bankAmt: { type: Number, default: 0 },
    wht: { type: Number, default: 0 },
    bankPaid: { type: Number, default: 0 },
    cashPaid: { type: Number, default: 0 },
    rebate: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    branchBank: { type: String, default: '' },

    // Short Week Deduction
    shortWeek: { type: Number, default: 0 },
    shortWeekDays: { type: Number, default: 0 },
    isShortWeek: { type: Boolean, default: false },

    // New Fields
    totalAbsents: { type: Number, default: 0 },
    allowedLeaves: { type: Number, default: 0 },

    payAdvSalary: { type: Boolean, default: false },
    thirtyWorkingDays: { type: Boolean, default: false },
    otst30WorkingDays: { type: Boolean, default: false },
    payFullSalaryThroughBank: { type: Boolean, default: false },

    // Flag: set to true for ALL records created via Excel import.
    // These records are ONLY shown on the Employee Payroll List (import report).
    // They MUST NOT affect advance ledger, employee ledger, or main payroll screens.
    isImportOnly: { type: Boolean, default: false },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Compound index for employee and month
PayrollSchema.index({ employee: 1, monthYear: 1 }, { unique: true });
PayrollSchema.index({ branch: 1, monthYear: 1 });
PayrollSchema.index({ department: 1, monthYear: 1 });
PayrollSchema.index({ monthYear: 1 });

module.exports = mongoose.model('Payroll', PayrollSchema);
