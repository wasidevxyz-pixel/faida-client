const CommissionCategory = require('../models/CommissionCategory');

// @desc    Get all categories
// @route   GET /api/v1/commission-categories
// @access  Private
exports.getCategories = async (req, res) => {
    try {
        const categories = await CommissionCategory.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Create category
// @route   POST /api/v1/commission-categories
// @access  Private
exports.createCategory = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const category = await CommissionCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Category already exists' });
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Update category
// @route   PUT /api/v1/commission-categories/:id
// @access  Private
exports.updateCategory = async (req, res) => {
    try {
        const category = await CommissionCategory.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/commission-categories/:id
// @access  Private
exports.deleteCategory = async (req, res) => {
    try {
        const category = await CommissionCategory.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
