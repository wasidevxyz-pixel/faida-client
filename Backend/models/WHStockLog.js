const mongoose = require('mongoose');

const whStockLogSchema = new mongoose.Schema({
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItem',
        required: true
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    type: {
        type: String,
        enum: ['in', 'out', 'audit'],
        required: true
    },
    qty: {
        type: Number,
        required: true
    },
    previousQty: {
        type: Number,
        default: 0
    },
    newQty: {
        type: Number,
        required: true
    },
    refType: {
        type: String,
        enum: ['purchase', 'purchase_return', 'audit', 'sale', 'sales_return'],
        required: true
    },
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    remarks: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
whStockLogSchema.index({ item: 1, date: -1 });
whStockLogSchema.index({ refType: 1, refId: 1 });

module.exports = mongoose.model('WHStockLog', whStockLogSchema);
