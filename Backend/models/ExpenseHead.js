const mongoose = require('mongoose');

const expenseHeadSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Head name is required'],
        trim: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExpenseHead',
        default: null  // null means this is a main head, otherwise it's a sub-head
    },
    type: {
        type: String,
        enum: ['both', 'expense', 'receipt'],  // 'both' means available for both expense and receipt
        default: 'both'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    branch: {
        type: String,
        required: true,
        default: 'Shop'
    }
}, {
    timestamps: true
});

// Index for faster queries
expenseHeadSchema.index({ parentId: 1 });
expenseHeadSchema.index({ type: 1 });
expenseHeadSchema.index({ isActive: 1 });
expenseHeadSchema.index({ branch: 1 });

// Virtual to get sub-heads
expenseHeadSchema.virtual('subHeads', {
    ref: 'ExpenseHead',
    localField: '_id',
    foreignField: 'parentId'
});

// Set object and JSON to include virtuals
expenseHeadSchema.set('toObject', { virtuals: true });
expenseHeadSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('ExpenseHead', expenseHeadSchema);
