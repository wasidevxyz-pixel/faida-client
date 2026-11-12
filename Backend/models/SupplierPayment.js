const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema({
    paymentNo: {
        type: String,
        unique: true,
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Please provide payment date'],
        default: Date.now
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
        required: [true, 'Please select a supplier']
    },
    branch: {
        type: String,
        required: [true, 'Please select a branch'],
        default: 'Shop'
    },
    previousBalance: {
        type: Number,
        default: 0
    },
    amount: {
        type: Number,
        required: [true, 'Please provide payment amount'],
        min: [0, 'Amount cannot be negative']
    },
    discountPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    balance: {
        type: Number,
        default: 0
    },
    paymentMode: {
        type: String,
        enum: ['cash', 'bank', 'cheque', 'online'],
        required: [true, 'Please select payment mode'],
        default: 'cash'
    },
    cashAccount: {
        type: String,
        default: 'Cash in Hand (Shop)'
    },
    bankName: {
        type: String
    },
    chequeNo: {
        type: String
    },
    chequeDate: {
        type: Date,
        validate: {
            validator: function(val) {
                if (!val) return true;
                const y = new Date(val).getFullYear();
                return y >= 2020 && y <= 2040;
            },
            message: props => `Invalid Cheque Date year: ${new Date(props.value).getFullYear()}. Must be between 2020 and 2040.`
        }
    },
    remarks: {
        type: String,
        trim: true,
        maxlength: [500, 'Remarks cannot be more than 500 characters']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes
supplierPaymentSchema.index({ supplier: 1 });
supplierPaymentSchema.index({ date: -1 });
supplierPaymentSchema.index({ paymentMode: 1 });
supplierPaymentSchema.index({ createdBy: 1 });

// Pre-save hook to generate payment number
supplierPaymentSchema.pre('save', async function (next) {
    if (!this.paymentNo) {
        const count = await mongoose.model('SupplierPayment').countDocuments();
        this.paymentNo = `SP-${String(count + 1).padStart(5, '0')}`;
    }

    // Calculate balance
    this.balance = this.previousBalance - this.amount - this.discountAmount;

    next();
});

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
