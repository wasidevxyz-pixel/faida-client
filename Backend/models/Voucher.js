const mongoose = require('mongoose');

const voucherEntrySchema = new mongoose.Schema({
    account: {
        type: String,
        required: [true, 'Please provide account name'],
        trim: true
    },
    debit: {
        type: Number,
        default: 0,
        min: 0
    },
    credit: {
        type: Number,
        default: 0,
        min: 0
    },
    detail: {
        type: String,
        trim: true
    }
});

const voucherSchema = new mongoose.Schema({
    voucherNo: {
        type: String,
        unique: true,
        trim: true
    },
    voucherType: {
        type: String,
        enum: ['JV', 'CRV', 'CPV', 'BPV', 'BRV'],
        required: [true, 'Please select voucher type']
    },
    date: {
        type: Date,
        required: [true, 'Please provide voucher date'],
        default: Date.now
    },
    branch: {
        type: String,
        required: [true, 'Please select a branch'],
        default: 'Shop'
    },
    entries: [voucherEntrySchema],
    totalDebit: {
        type: Number,
        default: 0
    },
    totalCredit: {
        type: Number,
        default: 0
    },
    narration: {
        type: String,
        trim: true,
        maxlength: [500, 'Narration cannot be more than 500 characters']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByName: {
        type: String,
        trim: true
    },
    computerName: {
        type: String,
        trim: true,
        default: 'Terminal'
    },
    ipAddress: {
        type: String,
        trim: true
    },
    deviceInfo: {
        type: String,
        trim: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedByName: {
        type: String,
        trim: true
    },
    updatedComputerName: {
        type: String,
        trim: true
    },
    updatedIpAddress: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Indexes
voucherSchema.index({ voucherType: 1 });
voucherSchema.index({ date: -1 });
voucherSchema.index({ createdBy: 1 });

// Combined Pre-save hook for Voucher No generation and totals calculation
voucherSchema.pre('save', async function () {
    if (!this.voucherNo) {
        const count = await mongoose.model('Voucher').countDocuments({ voucherType: this.voucherType });
        const prefix = this.voucherType.toUpperCase();
        this.voucherNo = `${prefix}-${String(count + 1).padStart(2, '0')}`;
    }

    // Calculate totals
    this.totalDebit = this.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
    this.totalCredit = this.entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);

    // Validation
    if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) {
        throw new Error('Total Debit and Total Credit must be equal');
    }
});

module.exports = mongoose.model('Voucher', voucherSchema);
