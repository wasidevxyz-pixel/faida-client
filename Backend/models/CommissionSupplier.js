const mongoose = require('mongoose');

const commissionSupplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide supplier name'],
        unique: true,
        trim: true
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

module.exports = mongoose.model('CommissionSupplier', commissionSupplierSchema);
