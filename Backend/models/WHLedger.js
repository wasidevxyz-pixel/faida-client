const mongoose = require('mongoose');

const whLedgerSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCustomer',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    description: {
        type: String,
        required: true
    },
    refType: {
        type: String,
        enum: ['Sale', 'SaleReturn', 'Payment', 'Opening'],
        required: true
    },
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    debit: {
        type: Number,
        default: 0
    },
    credit: {
        type: Number,
        default: 0
    },
    runningBalance: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

whLedgerSchema.index({ customer: 1, date: -1 });
whLedgerSchema.index({ date: -1 });
whLedgerSchema.index({ refType: 1, refId: 1 });

module.exports = mongoose.model('WHLedger', whLedgerSchema);
