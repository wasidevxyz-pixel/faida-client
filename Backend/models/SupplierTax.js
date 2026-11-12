const mongoose = require('mongoose');

const SupplierTaxSchema = new mongoose.Schema({
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: [true, 'Please add a branch']
    },
    date: {
        type: Date,
        required: [true, 'Please add a date']
    },
    entries: [{
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true
        },
        supplierName: String,
        subCategory: String,
        ntn: String,
        invoiceDate: Date,
        invoiceNumber: String,
        invoiceAmount: { type: Number, default: 0 },
        taxPct: { type: Number, default: 0 },
        taxDeducted: { type: Number, default: 0 },
        aiTaxPct: { type: Number, default: 0 },
        aiTaxAmount: { type: Number, default: 0 }
    }],
    totalAmount: { type: Number, default: 0 },
    totalTaxDeducted: { type: Number, default: 0 },
    totalAiTaxAmount: { type: Number, default: 0 },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// Prevent multiple records for same branch and date?
// Or just allow appending? The user screen looks like a daily entry form.
// I'll allow multiple or one per day?
// For now, allow multiple, or the user edits the day's record.
// The user asks for "Save" and "List".
// I'll assume each "Save" creates a new transaction record or updates.
// Given the form has a "Date" filter at top, it likely edits/shows data for that date.
// Unique compound index on branch + date?
SupplierTaxSchema.index({ branch: 1, date: 1 }, { unique: false });

module.exports = mongoose.model('SupplierTax', SupplierTaxSchema);
