const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
    accountId: {
        type: String,
        required: true,
        unique: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountCategory',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    class: {
        type: String, // e.g., Customer, Supplier, Bank, Cash, General
        required: true
    },
    branch: {
        type: String,
        default: 'Shop'
    },
    description: String,
    openingBalance: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Indexes for faster queries
accountSchema.index({ category: 1 });
accountSchema.index({ class: 1 });
accountSchema.index({ branch: 1 });
accountSchema.index({ isActive: 1 });
accountSchema.index({ name: 'text' });

module.exports = mongoose.model('Account', accountSchema);
