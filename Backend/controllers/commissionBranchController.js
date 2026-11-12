const CommissionBranch = require('../models/CommissionBranch');

// @desc    Get all commission branches
// @route   GET /api/v1/commission-branches
exports.getCommissionBranches = async (req, res) => {
    try {
        const branches = await CommissionBranch.find().sort({ name: 1 });
        res.status(200).json({
            success: true,
            count: branches.length,
            data: branches
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a commission branch
// @route   POST /api/v1/commission-branches
exports.createCommissionBranch = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const branch = await CommissionBranch.create(req.body);
        res.status(201).json({
            success: true,
            data: branch
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a commission branch
// @route   PUT /api/v1/commission-branches/:id
exports.updateCommissionBranch = async (req, res) => {
    try {
        let branch = await CommissionBranch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }

        branch = await CommissionBranch.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: branch
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a commission branch
// @route   DELETE /api/v1/commission-branches/:id
exports.deleteCommissionBranch = async (req, res) => {
    try {
        const branch = await CommissionBranch.findByIdAndDelete(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
