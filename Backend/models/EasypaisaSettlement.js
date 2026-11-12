const mongoose = require('mongoose');

const easypaisaSettlementSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        index: true
    },
    dateString: {
        type: String, // 'YYYY-MM-DD' for rapid indexed lookups
        required: true,
        index: true
    },
    branch: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    systemGross: {
        type: Number,
        default: 0
    },
    systemDeduction: {
        type: Number,
        default: 0
    },
    systemNet: {
        type: Number,
        default: 0
    },
    salmanAmount: {
        type: Number,
        default: null
    },
    departmentAmounts: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    difference: {
        type: Number,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'cleared'],
        default: 'pending',
        index: true
    },
    clearedAt: {
        type: Date
    },
    clearedBy: {
        type: String,
        trim: true
    },
    clearedFromDate: {
        type: Date
    },
    clearedToDate: {
        type: Date
    },
    clearedUpToDate: {
        type: Date
    },
    batchId: {
        type: String,
        default: null,
        index: true
    },
    transferRef: {
        type: String,
        trim: true,
        default: ''
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    },
    lastUpdatedBy: {
        type: String,
        trim: true
    },
    history: [{
        action: { type: String }, // 'tally_saved', 'cleared', 'reopened'
        salmanAmount: { type: Number },
        departmentAmounts: { type: mongoose.Schema.Types.Mixed },
        systemAmount: { type: Number },
        difference: { type: Number },
        transferRef: { type: String },
        remarks: { type: String },
        performedBy: { type: String },
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

// Ensure a single canonical tally record per date & branch
easypaisaSettlementSchema.index({ dateString: 1, branch: 1 }, { unique: true });
easypaisaSettlementSchema.index({ branch: 1, status: 1 });

module.exports = mongoose.model('EasypaisaSettlement', easypaisaSettlementSchema);
