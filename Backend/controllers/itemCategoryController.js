const Category = require('../models/Category');

// @desc    Get all item categories
// @route   GET /api/v1/item-categories
// @access  Private
exports.getItemCategories = async (req, res) => {
    try {
        let query = {
            categoryType: 'item',
            isActive: true
        };

        if (req.user && req.user.role !== 'admin') {
            if (req.user.allowedItemCategories && req.user.allowedItemCategories.length > 0) {
                query._id = { $in: req.user.allowedItemCategories };
            } else {
                // Not admin and no allowed categories? Show none.
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
        }

        const categories = await Category.find(query).sort('name');

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching item categories:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching item categories'
        });
    }
};

// @desc    Get single item category
// @route   GET /api/v1/item-categories/:id
// @access  Private
exports.getItemCategory = async (req, res) => {
    try {
        const category = await Category.findOne({
            _id: req.params.id,
            categoryType: 'item'
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Item category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error fetching item category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching item category'
        });
    }
};

// @desc    Create new item category
// @route   POST /api/v1/item-categories
// @access  Private
exports.createItemCategory = async (req, res) => {
    try {
        // Force categoryType to 'item' - user doesn't need to specify
        req.body.categoryType = 'item';
        req.body.createdBy = req.user.id;

        const category = await Category.create(req.body);

        res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error creating item category:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Item category with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create item category'
        });
    }
};

// @desc    Update item category
// @route   PUT /api/v1/item-categories/:id
// @access  Private
exports.updateItemCategory = async (req, res) => {
    try {
        // Prevent changing categoryType
        delete req.body.categoryType;

        const category = await Category.findOneAndUpdate(
            { _id: req.params.id, categoryType: 'item' },
            req.body,
            { returnDocument: 'after', runValidators: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Item category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error updating item category:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update item category'
        });
    }
};

// @desc    Delete item category (soft delete)
// @route   DELETE /api/v1/item-categories/:id
// @access  Private
exports.deleteItemCategory = async (req, res) => {
    try {
        const category = await Category.findOne({
            _id: req.params.id,
            categoryType: 'item'
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Item category not found'
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
        console.error('Error deleting item category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting item category'
        });
    }
};
