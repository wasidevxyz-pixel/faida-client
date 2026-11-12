const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    name_urdu: String,
    fatherName: String,
    cnic: String,
    branch: {
        type: String,
        default: 'Select Branch'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmployeeDepartment'
    },
    designation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Designation'
    },
    address: String,
    acNo: String,
    selectBank: String, // From Image 2
    mobileNo: String,
    resPhone: String,
    dateOfBirth: Date,
    issueDate: Date,
    joiningDate: Date,
    expiryDate: Date,
    resignDate: Date,
    incrDate: Date,
    gender: {
        type: String,
        enum: ['Male', 'Female'],
        default: 'Male'
    },
    religion: {
        type: String,
        enum: ['Islam', 'Christian', 'Hindu', 'Other'],
        default: 'Islam'
    },
    maritalStatus: {
        type: String,
        default: 'Single'
    },
    domicile: String,

    // Salary / Fix Section
    opening: { type: Number, default: 0 },
    basicSalary: { type: Number, default: 0 },
    salaryType: { type: String, default: 'Per Month' },
    stLoss: { type: Number, default: 0 },
    fixAllowance: { type: Number, default: 0 },
    otherAllowance: { type: Number, default: 0 },
    commEmp: { type: Boolean, default: false },
    allowFood: {
        type: String,
        enum: ['1 Time Deduction', '2 Time Deduction', 'Free', 'No Food'],
        default: 'No Food'
    },
    foodAllowanceRs: { type: Number, default: 0 },
    bankCash: { type: String, default: 'Cash' },
    deduction: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },

    // Duty Section
    fDutyTime: String,
    tDutyTime: String,
    scheduleFDutyTime: String,
    scheduleTDutyTime: String,
    offDay: String,
    totalHrs: String,

    // Employee Access Controls
    allowOvertime: { type: Boolean, default: false },
    otst30WorkingDays: { type: Boolean, default: false },
    eobi: { type: Boolean, default: false },
    payFullSalaryThroughBank: { type: Boolean, default: false },
    electricityBill: { type: Boolean, default: false },
    thirtyWorkingDays: { type: Boolean, default: false },
    allowEmployeeAdvance: { type: Boolean, default: false },
    allowRottiPerks: { type: Boolean, default: false },
    dontAllowRottiPerks: { type: Boolean, default: false },
    allowNashtaPerks: { type: Boolean, default: false },
    dontAllowNashtaPerks: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    payrollImportOnly: { type: Boolean, default: false }, // Auto-created during Excel import — hidden from all other screens

    // Employee Bank Details
    bankDetails: {
        hbl: String,
        alf: String,
        bop: String,
        bip: String,
        bahl: String
    },

    photo: String,
    idCardFront: String,
    idCardBack: String,
    fingerprintTemplate: String, // Base64 encoded template for matching
    
    // 📸 Face AI Biometric Section
    faceTemplate: {
        type: [Number], // 512-dimensional float vector array
        default: undefined,
        select: false // Excluded from general ERP queries to save bandwidth
    },
    hasFaceEnrolled: {
        type: Boolean,
        default: false,
        index: true
    },
    facePhotoUrl: {
        type: String,
        default: null
    },
    faceEnrolledAt: {
        type: Date,
        default: null
    },
}, {
    timestamps: true
});

// Add indexes for common filter fields
employeeSchema.index({ branch: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ designation: 1 });
employeeSchema.index({ isActive: 1 });
employeeSchema.index({ isActive: 1, code: 1 });
// Compound indexes for fast dashboard queries
employeeSchema.index({ isActive: 1, branch: 1 });
employeeSchema.index({ isActive: 1, branch: 1, code: 1 });
// Index for fast IMP employee filtering (payrollImportOnly queries on every attendance load)
employeeSchema.index({ payrollImportOnly: 1 });
employeeSchema.index({ code: 1, payrollImportOnly: 1 });

// ─── GLOBAL IMP EMPLOYEE EXCLUSION ──────────────────────────────────────────
// This pre-find hook automatically excludes payrollImportOnly employees from
// EVERY query on the Employee model — no controller can accidentally show them.
// To bypass (e.g. for the payroll import process itself), pass:
//   Employee.find({ ... }).setOptions({ includeImpEmployees: true })
function excludeImpEmployees() {
    // Skip if caller explicitly opts in
    if (this.getOptions().includeImpEmployees) return;
    // Skip if query is already targeting a specific employee by _id (ledger, etc.)
    const conditions = this.getQuery();
    if (conditions._id && !Array.isArray(conditions._id)) return;

    // Always inject payrollImportOnly filter — backed by an index, very fast.
    // This is the single source of truth for IMP employee exclusion.
    // NOTE: The IMP-code regex ($not: /^IMP-/i) was removed from this hook because
    // regex $not filters cannot use indexes and slowed down every employee query.
    // All IMP employees are already marked payrollImportOnly:true at import time,
    // so the boolean filter above is both sufficient and index-efficient.
    this.where({ payrollImportOnly: { $ne: true } });
}

// Apply to all read operations
employeeSchema.pre('find', excludeImpEmployees);
employeeSchema.pre('findOne', excludeImpEmployees);
employeeSchema.pre('countDocuments', excludeImpEmployees);
employeeSchema.pre('aggregate', function() {
    if (this.options && this.options.includeImpEmployees) return;
    // Inject $match at the start of any aggregate pipeline on Employee
    // Using only payrollImportOnly (indexed boolean) — no regex needed.
    this.pipeline().unshift({
        $match: {
            payrollImportOnly: { $ne: true }
        }
    });
});

module.exports = mongoose.model('Employee', employeeSchema);
