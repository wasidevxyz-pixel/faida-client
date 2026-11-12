const mongoose = require('mongoose');

const ExemptionInvoiceSchema = new mongoose.Schema({
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
        categoryName: String, // Explicitly added to keep track if supplier model changes
        ntn: String,
        invoiceDate: Date,
        invoiceNumber: String,
        invoiceAmount: { type: Number, default: 0 }
    }],
    totalAmount: { type: Number, default: 0 },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

ExemptionInvoiceSchema.index({ branch: 1, date: 1 }, { unique: false });

module.exports = mongoose.model('ExemptionInvoice', ExemptionInvoiceSchema);
