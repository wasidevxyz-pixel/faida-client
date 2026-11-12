const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
        required: true
    },
    items: [{
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Item',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 0
        },
        rate: {
            type: Number,
            required: true,
            min: 0
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        tax: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tax'
        },
        taxAmount: {
            type: Number,
            default: 0
        }
    }],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    roundOff: {
        type: Number,
        default: 0
    },
    grandTotal: {
        type: Number,
        required: true,
        min: 0
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'partial', 'paid'],
        default: 'pending'
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    balanceAmount: {
        type: Number,
        required: true
    },
    notes: {
        type: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    branch: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['draft', 'final', 'cancelled'],
        default: 'final'
    }
}, {
    timestamps: true
});

// Indexes
saleSchema.index({ date: 1 });
saleSchema.index({ party: 1 });
saleSchema.index({ createdBy: 1 });
saleSchema.index({ paymentStatus: 1 });

// Virtual for calculating balance
saleSchema.virtual('balance').get(function () {
    return this.grandTotal - this.paidAmount;
});

// Pre-save middleware for invoice number generation
// Note: Using async function without next parameter (Mongoose handles it automatically)
saleSchema.pre('save', async function () {
    if (!this.invoiceNumber) {
        const year = new Date().getFullYear();
        const count = await this.constructor.countDocuments({
            date: {
                $gte: new Date(year, 0, 1),
                $lt: new Date(year + 1, 0, 1)
            }
        });
        this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('Sale', saleSchema);
