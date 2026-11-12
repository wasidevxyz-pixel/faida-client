const mongoose = require('mongoose');

const SubBranchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    branch: {
        type: String, // Optional link to Store/Main Branch name
        required: false
    },
    active: {
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

SubBranchSchema.index({ name: 1 });
SubBranchSchema.index({ branch: 1 });
SubBranchSchema.index({ active: 1 });

module.exports = mongoose.model('SubBranch', SubBranchSchema);
