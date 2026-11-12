const mongoose = require('mongoose');

const pendingChequeDetailSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    branch: {
        type: String,
        required: true,
        trim: true
    },
    // 'cheque' = Pending Cheques tab | 'cash' = Cash Activity tab
    // Each tab creates its own separate document per branch+date
    type: {
        type: String,
        enum: ['cheque', 'cash'],
        required: true,
        default: 'cheque'
    },
    pendingCheques: {
        type: String,
        trim: true,
        default: ''
    },
    uncheckedCheques: {
        type: String,
        trim: true,
        default: ''
    },
    uncheckedCashActivityDays: {
        type: String,
        trim: true,
        default: ''
    },
    cashActivityDateRange: {
        type: String,
        trim: true,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Unique index: one record per branch + date + type
// This allows Pending CHQ and Cash Activity to coexist for the same branch+date
// NOTE: If upgrading, drop the old { date, branch } unique index in MongoDB first:
//   db.pendingchequedetails.dropIndex("date_-1_branch_1")
pendingChequeDetailSchema.index({ date: -1, branch: 1, type: 1 }, { unique: true });
pendingChequeDetailSchema.index({ branch: 1, date: -1, type: 1 });

module.exports = mongoose.model('PendingChequeDetail', pendingChequeDetailSchema);
