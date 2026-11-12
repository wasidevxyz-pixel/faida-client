const mongoose = require('mongoose');

const CommissionBranchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    active: {
        type: Boolean,
        default: true
    },
    branchTarget: {
        type: Number,
        default: 0
    },
    targetCommission: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

CommissionBranchSchema.index({ name: 1 });
CommissionBranchSchema.index({ active: 1 });

module.exports = mongoose.model('CommissionBranch', CommissionBranchSchema);
