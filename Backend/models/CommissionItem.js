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
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommissionCategory',
        required: [true, 'Please select a category']
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommissionSupplier',
        required: [true, 'Please select a supplier']
    },



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

module.exports = mongoose.model('CommissionItem', whItemSchema);
