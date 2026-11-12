const mongoose = require('mongoose');

const accountGroupSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: String,
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Index for isActive field
accountGroupSchema.index({ isActive: 1 });

module.exports = mongoose.model('AccountGroup', accountGroupSchema);
