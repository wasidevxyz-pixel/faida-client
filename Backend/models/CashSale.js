const mongoose = require('mongoose');

const CashSaleSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    branch: { type: String, required: true },
    mode: { type: String, default: 'Cash' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    cashCounter: { type: String, required: true }, // Assuming string for now, could be ref if there's a Counter model
    invoiceNo: { type: String, required: true },
    sales: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },

    // Bank Mode Fields
    bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank' },
    deductedAmount: { type: Number, default: 0 },
    isDeduction: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now }
});

// Indexes for faster dashboard and report queries
CashSaleSchema.index({ date: 1 });
CashSaleSchema.index({ branch: 1 });
CashSaleSchema.index({ date: 1, branch: 1 });

module.exports = mongoose.model('CashSale', CashSaleSchema);
