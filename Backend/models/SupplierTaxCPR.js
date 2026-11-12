const mongoose = require('mongoose');

const SupplierTaxCPRSchema = new mongoose.Schema({
    certificateNumber: {
        type: String,
        required: [true, 'Please add a certificate number'],
        unique: true
    },
    branch: {
        type: mongoose.Schema.ObjectId,
        ref: 'Store',
        required: [true, 'Please add a branch']
    },
    supplier: {
        type: mongoose.Schema.ObjectId,
        ref: 'Supplier',
        required: false
    },
    date: {
        type: Date,
        default: Date.now
    },
    month: {
        type: Number,
        required: [true, 'Please add a month (1-12)']
    },
    year: {
        type: Number,
        required: [true, 'Please add a year']
    },
    cprNumber: {
        type: String,
        required: [true, 'Please add a CPR number']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SupplierTaxCPR', SupplierTaxCPRSchema);
