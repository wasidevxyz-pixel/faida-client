const mongoose = require('mongoose');

const WHPurchaseReturnSchema = new mongoose.Schema({
    // Reference to original purchase (optional)
    originalPurchase: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHPurchase'
    },

    // Return Details
    returnNo: {
        type: String,
        required: true,
        unique: true
    },
    returnDate: {
        type: Date,
        required: true,
        default: Date.now
    },

    // Supplier Reference
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHSupplier',
        required: true
    },

    // Status
    status: {
        type: String,
        enum: ['Draft', 'Posted'],
        default: 'Draft'
    },

    postingNumber: {
        type: Number
    },

    // Items being returned
    items: [{
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WHItem',
            required: true
        },
        barcode: {
            type: String,
            trim: true
        },
        batch: String,
        expiry: Date,
        quantity: {
            type: Number,
            required: true,
            min: 0
        },
        bonus: {
            type: Number,
            default: 0
        },
        costPrice: {
            type: Number,
            required: true
        },
        discountPercent: {
            type: Number,
            default: 0
        },
        discountValue: {
            type: Number,
            default: 0
        },
        taxPercent: {
            type: Number,
            default: 0
        },
        taxValue: {
            type: Number,
            default: 0
        },
        netTotal: {
            type: Number,
            required: true
        },
        salePrice: Number,
        retailPrice: Number
    }],

    // Totals
    totalQuantity: {
        type: Number,
        default: 0
    },
    subTotal: {
        type: Number,
        default: 0
    },
    totalDiscount: {
        type: Number,
        default: 0
    },
    totalTax: {
        type: Number,
        default: 0
    },
    grandTotal: {
        type: Number,
        default: 0
    },

    // Additional Info
    remarks: String,
    taxCategory: {
        type: String,
        default: 'DEFAULT'
    },
    whCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCategory'
    },

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // History tracking
    history: [{
        action: String,
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        details: String
    }]
}, {
    timestamps: true
});

WHPurchaseReturnSchema.index({ returnDate: -1 });
WHPurchaseReturnSchema.index({ supplier: 1, returnDate: -1 });
WHPurchaseReturnSchema.index({ status: 1 });

// Pre-save middleware for return number generation
WHPurchaseReturnSchema.pre('save', async function () {
    if (!this.returnNo || this.returnNo === 'AUTO') {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);
        try {
            const count = await this.constructor.countDocuments({
                createdAt: { $gte: startOfYear, $lt: endOfYear }
            });
            this.returnNo = `PR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        } catch (err) {
            console.error('Error generating purchase return number:', err);
            throw err;
        }
    }
});

module.exports = mongoose.model('WHPurchaseReturn', WHPurchaseReturnSchema);
