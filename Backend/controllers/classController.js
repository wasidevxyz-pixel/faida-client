const ItemClass = require('../models/ItemClass');

// @desc    Get all classes
// @route   GET /api/v1/classes
// @access  Private
exports.getClasses = async (req, res) => {
    try {
        const classes = await ItemClass.find({ isActive: true }).sort('name');

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching classes'
        });
    }
};

// @desc    Get single class
// @route   GET /api/v1/classes/:id
// @access  Private
exports.getClass = async (req, res) => {
    try {
        const itemClass = await ItemClass.findById(req.params.id);

        if (!itemClass) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        res.status(200).json({
            success: true,
            data: itemClass
        });
    } catch (error) {
        console.error('Error fetching class:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching class'
        });
    }
};

// @desc    Create new class
// @route   POST /api/v1/classes
// @access  Private
exports.createClass = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        const itemClass = await ItemClass.create(req.body);

        res.status(201).json({
            success: true,
            data: itemClass
        });
    } catch (error) {
        console.error('Error creating class:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Class with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create class'
        });
    }
};

// @desc    Update class
// @route   PUT /api/v1/classes/:id
// @access  Private
exports.updateClass = async (req, res) => {
    try {
        const itemClass = await ItemClass.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!itemClass) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        res.status(200).json({
            success: true,
            data: itemClass
        });
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update class'
        });
    }
};

// @desc    Delete class
// @route   DELETE /api/v1/classes/:id
// @access  Private
exports.deleteClass = async (req, res) => {
    try {
        const itemClass = await ItemClass.findById(req.params.id);

        if (!itemClass) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        itemClass.isActive = false;
        await itemClass.save();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting class'
        });
    }
};
