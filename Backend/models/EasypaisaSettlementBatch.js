const mongoose = require('mongoose');

const easypaisaSettlementBatchSchema = new mongoose.Schema({
    batchNo: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    fromDate: {
        type: String,
        required: true
    },
    toDate: {
        type: String,
        required: true
    },
    branch: {
        type: String,
        default: 'All Branches'
    },
    department: {
        type: String,
        default: 'All Departments'
    },
    recordsCount: {
        type: Number,
        default: 0
    },
    totalSystemGross: {
        type: Number,
        default: 0
    },
    totalSystemNet: {
        type: Number,
        default: 0
    },
    totalSalmanAmount: {
        type: Number,
        default: 0
    },
    totalDiscrepancy: {
        type: Number,
        default: 0
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
    clearedBy: {
        type: String,
        default: 'Boss'
    },
    clearedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'reopened'],
        default: 'active'
    },
    clearedDateKeys: [{
        type: String // e.g. "2026-09-01_(Attock)"
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('EasypaisaSettlementBatch', easypaisaSettlementBatchSchema);
