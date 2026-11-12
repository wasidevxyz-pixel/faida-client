const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/v1/categories
// @route   GET /api/v1/categories?type=customer
// @route   GET /api/v1/categories?type=supplier
// @route   GET /api/v1/categories?type=item
// @access  Private
exports.getCategories = async (req, res) => {
    try {
        // Build filter query
        let filter = { isActive: true };

        // Filter by categoryType if provided
        if (req.query.type) {
            filter.categoryType = req.query.type;
        }

        const categories = await Category.find(filter).sort('name');

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching categories'
        });
    }
};

// @desc    Get single category
// @route   GET /api/v1/categories/:id
// @access  Private
exports.getCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching category'
        });
    }
};

// @desc    Create new category
// @route   POST /api/v1/categories
// @access  Private
exports.createCategory = async (req, res) => {
    try {
        // Add user to req.body
        req.body.createdBy = req.user.id;

        const category = await Category.create(req.body);

        res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error creating category:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create category'
        });
    }
};

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private
exports.updateCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update category'
        });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
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
        console.error('Error deleting category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting category'
        });
    }
};
