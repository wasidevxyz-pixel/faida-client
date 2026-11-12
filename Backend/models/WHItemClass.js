const mongoose = require('mongoose');

const whItemClassSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide class name'],
        trim: true,
        unique: true
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

module.exports = mongoose.model('WHItemClass', whItemClassSchema);
