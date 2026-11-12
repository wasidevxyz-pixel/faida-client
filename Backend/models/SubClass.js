const mongoose = require('mongoose');

const SubClassSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a subclass name'],
        unique: true,
        trim: true
    },
    code: {
        type: String,
        trim: true
    },
    parentClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ItemClass'
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

module.exports = mongoose.model('SubClass', SubClassSchema);
