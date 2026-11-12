const mongoose = require('mongoose');

const whCitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide city name'],
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

module.exports = mongoose.model('WHCity', whCitySchema);
