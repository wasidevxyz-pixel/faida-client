const SubBranch = require('../models/SubBranch');

// @desc    Get all sub-branches
// @route   GET /api/v1/sub-branches
exports.getSubBranches = async (req, res) => {
    try {
        let query = req.query.branch ? { branch: req.query.branch } : {};

        // If user is not admin and has specific allowed branches, filter sub-branches too
        // Unless 'all=true' is passed in query string
        if (!req.query.all && req.user && req.user.role !== 'admin') {
            const userBranches = Array.isArray(req.user.branch)
                ? req.user.branch.map(b => String(b).trim()).filter(Boolean)
                : (req.user.branch ? [String(req.user.branch).trim()].filter(Boolean) : []);

            if (userBranches.length > 0) {
                query.$or = [
                    { name: { $in: userBranches } },
                    { branch: { $in: userBranches } }
                ];
            }
        }

        const subBranches = await SubBranch.find(query).sort({ name: 1 });
        res.status(200).json({
            success: true,
            count: subBranches.length,
            data: subBranches
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a sub-branch
// @route   POST /api/v1/sub-branches
exports.createSubBranch = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const subBranch = await SubBranch.create(req.body);
        res.status(201).json({
            success: true,
            data: subBranch
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a sub-branch
// @route   PUT /api/v1/sub-branches/:id
exports.updateSubBranch = async (req, res) => {
    try {
        let subBranch = await SubBranch.findById(req.params.id);
        if (!subBranch) {
            return res.status(404).json({ success: false, message: 'Sub-branch not found' });
        }

        subBranch = await SubBranch.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: subBranch
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a sub-branch
// @route   DELETE /api/v1/sub-branches/:id
exports.deleteSubBranch = async (req, res) => {
    try {
        const subBranch = await SubBranch.findByIdAndDelete(req.params.id);
        if (!subBranch) {
            return res.status(404).json({ success: false, message: 'Sub-branch not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
