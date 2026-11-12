const mongoose = require('mongoose');

const EmployeePenaltySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    designation: String,
    penaltyAmount: {
        type: Number,
        required: true,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

EmployeePenaltySchema.index({ employee: 1, date: -1 });
EmployeePenaltySchema.index({ date: -1 });
EmployeePenaltySchema.index({ branch: 1, date: -1 });

module.exports = mongoose.model('EmployeePenalty', EmployeePenaltySchema);
