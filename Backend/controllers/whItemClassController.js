const WHItemClass = require('../models/WHItemClass');

// @desc    Get all classes
// @route   GET /api/v1/wh-item-classes
exports.getClasses = async (req, res) => {
    try {
        const classes = await WHItemClass.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: classes.length, data: classes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create class
// @route   POST /api/v1/wh-item-classes
exports.createClass = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const itemClass = await WHItemClass.create(req.body);
        res.status(201).json({ success: true, data: itemClass });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update class
// @route   PUT /api/v1/wh-item-classes/:id
exports.updateClass = async (req, res) => {
    try {
        const itemClass = await WHItemClass.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!itemClass) return res.status(404).json({ success: false, message: 'Class not found' });
        res.status(200).json({ success: true, data: itemClass });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete class
// @route   DELETE /api/v1/wh-item-classes/:id
exports.deleteClass = async (req, res) => {
    try {
        const itemClass = await WHItemClass.findByIdAndDelete(req.params.id);
        if (!itemClass) return res.status(404).json({ success: false, message: 'Class not found' });
        res.status(200).json({ success: true, message: 'Class deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
