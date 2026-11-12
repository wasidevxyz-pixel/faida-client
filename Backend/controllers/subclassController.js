const SubClass = require('../models/SubClass');

// @desc    Get all subclasses
// @route   GET /api/v1/subclasses
// @access  Private
exports.getSubClasses = async (req, res) => {
    try {
        const query = { isActive: true };

        // Filter by parent class if provided
        if (req.query.parentClass) {
            query.parentClass = req.query.parentClass;
        }

        const subclasses = await SubClass.find(query)
            .populate('parentClass', 'name')
            .sort('name');

        res.status(200).json({
            success: true,
            count: subclasses.length,
            data: subclasses
        });
    } catch (error) {
        console.error('Error fetching subclasses:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching subclasses'
        });
    }
};

// @desc    Get single subclass
// @route   GET /api/v1/subclasses/:id
// @access  Private
exports.getSubClass = async (req, res) => {
    try {
        const subclass = await SubClass.findById(req.params.id)
            .populate('parentClass', 'name');

        if (!subclass) {
            return res.status(404).json({
                success: false,
                message: 'SubClass not found'
            });
        }

        res.status(200).json({
            success: true,
            data: subclass
        });
    } catch (error) {
        console.error('Error fetching subclass:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching subclass'
        });
    }
};

// @desc    Create new subclass
// @route   POST /api/v1/subclasses
// @access  Private
exports.createSubClass = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        const subclass = await SubClass.create(req.body);

        res.status(201).json({
            success: true,
            data: subclass
        });
    } catch (error) {
        console.error('Error creating subclass:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'SubClass with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create subclass'
        });
    }
};

// @desc    Update subclass
// @route   PUT /api/v1/subclasses/:id
// @access  Private
exports.updateSubClass = async (req, res) => {
    try {
        const subclass = await SubClass.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!subclass) {
            return res.status(404).json({
                success: false,
                message: 'SubClass not found'
            });
        }

        res.status(200).json({
            success: true,
            data: subclass
        });
    } catch (error) {
        console.error('Error updating subclass:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update subclass'
        });
    }
};

// @desc    Delete subclass
// @route   DELETE /api/v1/subclasses/:id
// @access  Private
exports.deleteSubClass = async (req, res) => {
    try {
        const subclass = await SubClass.findById(req.params.id);

        if (!subclass) {
            return res.status(404).json({
                success: false,
                message: 'SubClass not found'
            });
        }

        subclass.isActive = false;
        await subclass.save();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Error deleting subclass:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting subclass'
        });
    }
};
