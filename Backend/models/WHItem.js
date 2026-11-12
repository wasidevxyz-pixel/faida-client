const mongoose = require('mongoose');

const whItemSchema = new mongoose.Schema({
    seqId: {
        type: Number,
        unique: true
    },
    itemsCode: {
        type: String,
        trim: true,
        unique: true
    },
    barcode: {
        type: String,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Please provide item name'],
        trim: true
    },
    costPrice: {
        type: Number,
        default: 0
    },
    salePrice: {
        type: Number,
        default: 0
    },
    retailPrice: {
        type: Number,
        default: 0
    },
    incentive: {
        type: Number,
        default: 0
    },

    // Relations
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemCompany',
        required: [true, 'Please select a company']
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemCategory',
        required: [true, 'Please select a category']
    },
    itemClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemClass',
        required: [true, 'Please select a class']
    },
    subClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHItemSubClass',
        required: [true, 'Please select a subclass']
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WHSupplier',
        required: [true, 'Please select a supplier']
    },

    // Stock Data
    stock: [{
        store: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Store'
        },
        quantity: {
            type: Number,
            default: 0
        },
        opening: {
            type: Number,
            default: 0
        }
    }],

    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for faster queries and searches
whItemSchema.index({ name: 'text', itemsCode: 'text', barcode: 'text' });
whItemSchema.index({ company: 1 });
whItemSchema.index({ category: 1 });
whItemSchema.index({ itemClass: 1 });
whItemSchema.index({ subClass: 1 });
whItemSchema.index({ supplier: 1 });
whItemSchema.index({ isActive: 1 });

module.exports = mongoose.model('WHItem', whItemSchema);
