const mongoose = require('mongoose');

const whSupplierSchema = new mongoose.Schema({
    code: {
        type: String,
        trim: true
    },
    supplierName: {
        type: String,
        required: [true, 'Please provide supplier name'],
        trim: true
    },
    supplierNTN: {
        type: String,
        required: [true, 'Please provide supplier NTN'],
        trim: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store'
    },
    address: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    mobile: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true
    },
    strn: {
        type: String,
        trim: true
    },
    openingBalance: {
        type: Number,
        default: 0
    },
    supplierCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHSupplierCategory'
    },
    whtPercentage: {
        type: Number,
        default: 0
    },
    advTaxPercentage: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

whSupplierSchema.index({ supplierName: 1 });
whSupplierSchema.index({ isActive: 1 });
whSupplierSchema.index({ code: 1 });
whSupplierSchema.index({ supplierCategory: 1 });
whSupplierSchema.index({ branch: 1 });

module.exports = mongoose.model('WHSupplier', whSupplierSchema);
