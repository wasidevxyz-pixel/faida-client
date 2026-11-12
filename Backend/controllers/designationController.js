const Designation = require('../models/Designation');

// @desc    Get all designations
// @route   GET /api/v1/designations
// @access  Private
exports.getDesignations = async (req, res) => {
    try {
        const designations = await Designation.find().sort({ name: 1 }).lean();
        res.status(200).json({ success: true, count: designations.length, data: designations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get single designation
// @route   GET /api/v1/designations/:id
// @access  Private
exports.getDesignation = async (req, res) => {
    try {
        const designation = await Designation.findById(req.params.id).lean();
        if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
        res.status(200).json({ success: true, data: designation });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Create designation
// @route   POST /api/v1/designations
// @access  Private/Admin
exports.createDesignation = async (req, res) => {
    try {
        const designation = await Designation.create(req.body);
        res.status(201).json({ success: true, data: designation });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update designation
// @route   PUT /api/v1/designations/:id
// @access  Private/Admin
exports.updateDesignation = async (req, res) => {
    try {
        const designation = await Designation.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
        res.status(200).json({ success: true, data: designation });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete designation
// @route   DELETE /api/v1/designations/:id
// @access  Private/Admin
exports.deleteDesignation = async (req, res) => {
    try {
        const designation = await Designation.findById(req.params.id);
        if (!designation) return res.status(404).json({ success: false, message: 'Designation not found' });
        await designation.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
