const mongoose = require('mongoose');

const EmployeeDepartmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a department name'],
        unique: true,
        trim: true
    },
    branch: {
        type: String,
        default: 'F-6'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    maxCheckoutTime: {
        type: String,
        default: '03:00' // Default cutoff at 3:00 AM
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('EmployeeDepartment', EmployeeDepartmentSchema);
