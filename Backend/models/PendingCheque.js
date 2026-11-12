const mongoose = require('mongoose');

const pendingChequeSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: Date.now
    },
    branch: {
        type: String,
        required: true,
        trim: true
    },
    bankDate: {
        type: Date,
        required: true
    },
    statementDate: {
        type: Date
    },
    bankAmount: {
        type: Number,
        default: 0
    },
    pendingChq: {
        type: Number,
        default: 0
    },
    statement: {
        type: Number,
        default: 0
    },
    diff: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

pendingChequeSchema.index({ branch: 1, date: -1 });
pendingChequeSchema.index({ date: -1 });
pendingChequeSchema.index({ bankDate: -1 });

module.exports = mongoose.model('PendingCheque', pendingChequeSchema);
