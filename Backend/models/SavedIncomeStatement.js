const mongoose = require('mongoose');

const SavedIncomeStatementSchema = new mongoose.Schema({
    branch: { type: String, required: true },
    period: { type: String, required: true },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    timestamp: { type: Date, default: Date.now },

    // Store the complete report data JSON
    data: { type: Object, required: true },

    // Store summary for quick listing
    summary: {
        netSales: String,
        cost: String,
        grossProfit: String,
        expenses: String, // Manual expenses
        netProfit: String
    },

    // Manual inputs
    expenses: { type: String }, // The raw input value

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

SavedIncomeStatementSchema.index({ branch: 1, period: 1 });
SavedIncomeStatementSchema.index({ timestamp: -1 });
SavedIncomeStatementSchema.index({ periodStart: 1, periodEnd: 1 });

module.exports = mongoose.model('SavedIncomeStatement', SavedIncomeStatementSchema);
