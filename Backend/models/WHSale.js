const mongoose = require('mongoose');

const whSaleSchema = new mongoose.Schema({
    invoiceNo: {
        type: String,
        required: true,
        trim: true
    },
    invoiceDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCustomer',
        required: true
    },
    remarks: {
        type: String,
        trim: true
    },
    whCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemCategory'
    },

    // Line Items
    items: [{
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WHItem',
            required: true
        },
        name: {
            type: String,
            trim: true
        },
        itemName: {
            type: String,
            trim: true
        },
        barcode: {
            type: String,
            trim: true
        },
        itemClass: {
            type: mongoose.Schema.Types.Mixed
        },
        className: {
            type: String,
            trim: true
        },
        store: {
            type: String,
            trim: true
        },
        quantity: { // Pack
            type: Number,
            required: true,
            min: 0
        },
        pcsPrice: {
            type: Number,
            required: true,
            min: 0
        },
        retailPrice: {
            type: Number,
            default: 0
        },
        subTotal: {
            type: Number,
            default: 0
        },
        taxPercent: {
            type: Number,
            default: 0
        },
        taxAmount: {
            type: Number,
            default: 0
        },
        totalBeforeIncentive: {
            type: Number,
            default: 0
        },
        incentive: {
            type: Number,
            default: 0
        },
        discountPercent: {
            type: Number,
            default: 0
        },
        discountAmount: {
            type: Number,
            default: 0
        },
        netTotal: {
            type: Number,
            default: 0
        }
    }],

    // Footer Totals
    totalQuantity: { // Sum of Packs
        type: Number,
        default: 0
    },
    totalAmount: { // Sum of gross amounts
        type: Number,
        default: 0
    },
    globalDiscountPercent: {
        type: Number,
        default: 0
    },
    globalDiscountAmount: {
        type: Number,
        default: 0
    },
    globalTaxPercent: {
        type: Number,
        default: 0
    },
    globalTaxAmount: {
        type: Number,
        default: 0
    },
    miscCharges: {
        type: Number,
        default: 0
    },
    freightCharges: {
        type: Number,
        default: 0
    },
    netTotal: {
        type: Number,
        default: 0
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    cashReceived: {
        type: Number,
        default: 0
    },
    changeAmount: {
        type: Number,
        default: 0
    },
    invoiceBalance: {
        type: Number,
        default: 0
    },
    previousBalance: {
        type: Number,
        default: 0
    },
    newBalance: {
        type: Number,
        default: 0
    },

    payMode: {
        type: String,
        enum: ['Cash', 'Bank', 'Credit'],
        default: 'Credit'
    },
    printSize: {
        type: String,
        default: 'A4'
    },

    status: {
        type: String,
        enum: ['Draft', 'Posted', 'Cancelled'],
        default: 'Posted'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

whSaleSchema.index({ invoiceDate: -1 });
whSaleSchema.index({ customer: 1, invoiceDate: -1 });
whSaleSchema.index({ status: 1 });
whSaleSchema.index({ invoiceNo: 1 });
whSaleSchema.index({ createdBy: 1 });
whSaleSchema.index({ whCategory: 1 });

// Pre-save middleware for invoice number generation
whSaleSchema.pre('save', async function () {
    if (!this.invoiceNo || this.invoiceNo === 'AUTO') {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        try {
            const count = await this.constructor.countDocuments({
                createdAt: { $gte: startOfYear, $lt: endOfYear }
            });
            this.invoiceNo = `INV-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        } catch (err) {
            console.error('Error generating sale invoice number:', err);
            throw err;
        }
    }
});

module.exports = mongoose.model('WHSale', whSaleSchema);
