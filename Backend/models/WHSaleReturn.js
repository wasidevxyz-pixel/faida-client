const mongoose = require('mongoose');

const whSaleReturnSchema = new mongoose.Schema({
    returnNo: { // Inv.No in return screen
        type: String,
        required: true,
        trim: true
    },
    returnDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHCustomer',
        required: true
    },
    whCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemCategory'
    },
    dcNo: {
        type: String,
        trim: true
    },
    biltyNo: {
        type: String,
        trim: true
    },
    transporter: {
        type: String,
        trim: true
    },
    remarks: {
        type: String,
        trim: true
    },

    // Line Items
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
        store: {
            type: String,
            trim: true
        },
        quantity: { // Pack
            type: Number,
            required: true,
            min: 0
        },
        pcsPrice: { // was price
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
        totalBeforeIncentive: { // was totalBeforeDiscount
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
        },
        itemRemarks: {
            type: String,
            trim: true
        }
    }],

    // Footer Totals
    totalQuantity: {
        type: Number,
        default: 0
    },
    totalAmount: {
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
    returnBalance: {
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

whSaleReturnSchema.index({ returnDate: -1 });
whSaleReturnSchema.index({ customer: 1, returnDate: -1 });
whSaleReturnSchema.index({ status: 1 });
whSaleReturnSchema.index({ returnNo: 1 });

// Pre-save middleware for return number generation
whSaleReturnSchema.pre('save', async function () {
    if (!this.returnNo || this.returnNo === 'AUTO') {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);
        try {
            const count = await this.constructor.countDocuments({
                createdAt: { $gte: startOfYear, $lt: endOfYear }
            });
            this.returnNo = `SR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        } catch (err) {
            console.error('Error generating sale return number:', err);
            throw err;
        }
    }
});

module.exports = mongoose.model('WHSaleReturn', whSaleReturnSchema);
