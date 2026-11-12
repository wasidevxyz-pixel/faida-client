const mongoose = require('mongoose');

const whPOSCounterSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    value: {
        type: Number,
        required: true,
        default: 1000
    }
}, {
    versionKey: false
});

module.exports = mongoose.model('WHPOSCounter', whPOSCounterSchema);
