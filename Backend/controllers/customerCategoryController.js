const PartyCategory = require('../models/PartyCategory');

// @desc    Get all customer categories
// @route   GET /api/v1/customer-categories
// @access  Private
exports.getCustomerCategories = async (req, res) => {
    try {
        const categories = await PartyCategory.find({
            type: 'customer',
            isActive: true
        }).sort('name');

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching customer categories:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching customer categories'
        });
    }
};

// @desc    Get single customer category
// @route   GET /api/v1/customer-categories/:id
// @access  Private
exports.getCustomerCategory = async (req, res) => {
    try {
        const category = await PartyCategory.findOne({
            _id: req.params.id,
            type: 'customer'
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Customer category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error fetching customer category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching customer category'
        });
    }
};

// @desc    Create new customer category
// @route   POST /api/v1/customer-categories
// @access  Private
exports.createCustomerCategory = async (req, res) => {
    try {
        // Force type to 'customer'
        req.body.type = 'customer';
        req.body.createdBy = req.user.id;

        const category = await PartyCategory.create(req.body);

        res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error creating customer category:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Customer category with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create customer category'
        });
    }
};

// @desc    Update customer category
// @route   PUT /api/v1/customer-categories/:id
// @access  Private
exports.updateCustomerCategory = async (req, res) => {
    try {
        // Prevent changing type
        delete req.body.type;

        const category = await PartyCategory.findOneAndUpdate(
            { _id: req.params.id, type: 'customer' },
            req.body,
            { returnDocument: 'after', runValidators: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Customer category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error updating customer category:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update customer category'
        });
    }
};

// @desc    Delete customer category (soft delete)
// @route   DELETE /api/v1/customer-categories/:id
// @access  Private
exports.deleteCustomerCategory = async (req, res) => {
    try {
        const category = await PartyCategory.findOne({
            _id: req.params.id,
            type: 'customer'
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Customer category not found'
            });
        }

        // Soft delete - just mark as inactive
        category.isActive = false;
        await category.save();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Error deleting customer category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting customer category'
        });
    }
};
