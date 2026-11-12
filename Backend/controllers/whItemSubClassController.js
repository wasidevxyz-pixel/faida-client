const WHItemSubClass = require('../models/WHItemSubClass');

// @desc    Get all subclasses
// @route   GET /api/v1/wh-item-subclasses
exports.getSubClasses = async (req, res) => {
    try {
        const subClasses = await WHItemSubClass.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: subClasses.length, data: subClasses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create subclass
// @route   POST /api/v1/wh-item-subclasses
exports.createSubClass = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const subClass = await WHItemSubClass.create(req.body);
        res.status(201).json({ success: true, data: subClass });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update subclass
// @route   PUT /api/v1/wh-item-subclasses/:id
exports.updateSubClass = async (req, res) => {
    try {
        const subClass = await WHItemSubClass.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!subClass) return res.status(404).json({ success: false, message: 'SubClass not found' });
        res.status(200).json({ success: true, data: subClass });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete subclass
// @route   DELETE /api/v1/wh-item-subclasses/:id
exports.deleteSubClass = async (req, res) => {
    try {
        const subClass = await WHItemSubClass.findByIdAndDelete(req.params.id);
        if (!subClass) return res.status(404).json({ success: false, message: 'SubClass not found' });
        res.status(200).json({ success: true, message: 'SubClass deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
