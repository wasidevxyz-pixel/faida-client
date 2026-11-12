const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a category name'],
        trim: true
    },
    code: {
        type: String,
        trim: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store'
    },
    categoryType: {
        type: String,
        enum: ['customer', 'supplier', 'item'],
        required: [true, 'Please specify category type (customer, supplier, or item)']
    },
    description: {
        type: String
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

CategorySchema.index({ name: 1 });
CategorySchema.index({ categoryType: 1 });
CategorySchema.index({ isActive: 1 });
CategorySchema.index({ branch: 1 });

module.exports = mongoose.model('Category', CategorySchema);
