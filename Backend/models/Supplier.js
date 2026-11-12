const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: [true, 'Please select a branch']
    },
    name: {
        type: String,
        required: [true, 'Please provide supplier name'],
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true,
        default: 'RWP'
    },
    phoneNo: {
        type: String,
        trim: true
    },
    mobileNo: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    ntn: {
        type: String,
        trim: true
    },
    strn: {
        type: String,
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PartyCategory'
    },
    subCategory: {
        type: String,
        trim: true
    },
    whtType: {
        type: String,
        enum: ['Daily', 'Weekly', 'Bi-Monthly', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually', 'null'],
        default: 'Monthly'
    },
    whtPer: {
        type: Number,
        default: 0
    },
    advTaxPer: {
        type: Number,
        default: 0
    },
    opening: {
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

// Indexes for searching
supplierSchema.index({ name: 'text', ntn: 'text', mobileNo: 'text' });

module.exports = mongoose.model('Supplier', supplierSchema);
