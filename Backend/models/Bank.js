const mongoose = require('mongoose');

const bankSchema = new mongoose.Schema({
    bankType: {
        type: String,
        default: 'Branch Bank'
    },
    bankName: {
        type: String,
        required: true,
        trim: true
    },
    accountTitle: {
        type: String,
        required: true,
        trim: true
    },
    accountNo: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    phoneNo: String,
    mobileNo: String,
    branch: {
        type: String,
        default: 'Shop'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    deduction: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isPayrollBank: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Bank', bankSchema);
