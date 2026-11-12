const mongoose = require('mongoose');

const DailyCashSchema = new mongoose.Schema({
    user: { type: String, required: true },
    date: { type: Date, required: true },
    branch: { type: String, required: true },
    mode: { type: String, default: 'Cash' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    slip: { type: String },
    bigCash: { type: Number, default: 0 },
    remarks: { type: String },
    batchNo: { type: String },

    // Bank Mode Fields
    bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
    deductedAmount: { type: Number, default: 0 },
    isDeduction: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verifiedDate: { type: Date }, // Date when verified/transferred to bank
    clearedAt: { type: Date }, // System date when the transaction was actually cleared

    // Denominations
    x5000: { type: Number, default: 0 },
    x1000: { type: Number, default: 0 },
    x500: { type: Number, default: 0 },
    x100: { type: Number, default: 0 },
    x75: { type: Number, default: 0 },
    x50: { type: Number, default: 0 },
    x20: { type: Number, default: 0 },
    x10: { type: Number, default: 0 },
    x5: { type: Number, default: 0 },
    x2: { type: Number, default: 0 },
    x1: { type: Number, default: 0 },

    expense: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },

    createdAt: { type: Date, default: Date.now }
});

DailyCashSchema.index({ branch: 1, date: -1 });
DailyCashSchema.index({ date: -1 });
DailyCashSchema.index({ isVerified: 1 });
DailyCashSchema.index({ mode: 1, date: -1 });

module.exports = mongoose.model('DailyCash', DailyCashSchema);
