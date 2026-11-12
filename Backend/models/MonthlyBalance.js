const mongoose = require('mongoose');

const MonthlyBalanceSchema = new mongoose.Schema({
    branch: {
        type: String,
        required: true,
        index: true
    },
    monthString: { // Format: "YYYY-MM"
        type: String,
        required: true,
        index: true
    },
    openingBalance: {
        type: Number,
        default: 0
    },
    closingBalance: {
        type: Number,
        default: 0
    },
    isClosed: { // If true, balance is finalized
        type: Boolean,
        default: false
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Composite index for unique monthly balance per branch
MonthlyBalanceSchema.index({ branch: 1, monthString: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyBalance', MonthlyBalanceSchema);
