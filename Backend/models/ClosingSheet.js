const mongoose = require('mongoose');

const ClosingSheetSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    branch: { type: String, required: true },

    // Tab 1: Department Opening
    departmentOpening: [{
        department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
        amount: { type: Number, default: 0 }
    }],

    // Tab 2: Closing 01
    closing01: {
        openingCash: { type: Number, default: 0 },
        receivedCash: { type: Number, default: 0 },
        departmentTotal: { type: Number, default: 0 },
        counterCashTotal: { type: Number, default: 0 },
        percentageCashTotal: { type: Number, default: 0 },
        totalClosing02: { type: Number, default: 0 },
        totalClosing01: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 },
        departments: [{
            department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
            amount: { type: Number, default: 0 }
        }]
    },

    // Tab 3: Closing 02
    closing02: {
        // Placeholder structure
        data: { type: mongoose.Schema.Types.Mixed }
    },

    // Tab 4: Department Closing
    departmentClosing: {
        data: { type: mongoose.Schema.Types.Mixed }
    },

    // Tab 5: Salesman Sales
    salesmanSales: {
        data: { type: mongoose.Schema.Types.Mixed }
    },

    // Tab 6: SMS Sending
    smsSending: {
        data: { type: mongoose.Schema.Types.Mixed }
    },

    // Tab 7: Income Statement
    incomeStatement: {
        data: { type: mongoose.Schema.Types.Mixed }
    },

    // Tab 8: Reporting
    reporting: {
        data: { type: mongoose.Schema.Types.Mixed }
    },

    createdAt: { type: Date, default: Date.now }
});

// index to ensure unique closing sheet per branch per date
ClosingSheetSchema.index({ date: 1, branch: 1 }, { unique: true });

module.exports = mongoose.model('ClosingSheet', ClosingSheetSchema);
