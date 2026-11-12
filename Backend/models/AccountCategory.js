const mongoose = require('mongoose');

const accountCategorySchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountGroup',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Indexes for faster queries
accountCategorySchema.index({ group: 1 });
accountCategorySchema.index({ isActive: 1 });

module.exports = mongoose.model('AccountCategory', accountCategorySchema);
