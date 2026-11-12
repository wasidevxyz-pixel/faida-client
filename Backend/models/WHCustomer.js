const mongoose = require('mongoose');

const whCustomerSchema = new mongoose.Schema({
    code: {
        type: String,
        trim: true
    },
    customerName: {
        type: String,
        required: [true, 'Please provide customer name'],
        trim: true
    },
    customerNTN: {
        type: String,
        required: [true, 'Please provide customer NTN'],
        trim: true
    },
    customerCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCustomerCategory'
    },
    customerType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCustomerType'
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
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCity'
    },
    province: {
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
    cnic: {
        type: String,
        trim: true
    },
    strn: {
        type: String,
        trim: true
    },
    iTax: {
        type: String,
        trim: true
    },
    sTax: {
        type: String,
        trim: true
    },
    openingBalance: {
        type: Number,
        default: 0
    },
    currentBalance: {
        type: Number,
        default: 0
    },
    creditLimit: {
        type: Number,
        default: 0
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
    isCash: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

whCustomerSchema.index({ customerName: 1 });
whCustomerSchema.index({ isActive: 1 });
whCustomerSchema.index({ customerCategory: 1 });
whCustomerSchema.index({ customerType: 1 });
whCustomerSchema.index({ code: 1 });

module.exports = mongoose.model('WHCustomer', whCustomerSchema);
