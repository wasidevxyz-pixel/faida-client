const mongoose = require('mongoose');

const whCustomerTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide customer type name'],
        trim: true,
        unique: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('WHCustomerType', whCustomerTypeSchema);
