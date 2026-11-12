const WHSupplierCategory = require('../models/WHSupplierCategory');

// @desc    Get all categories
// @route   GET /api/v1/wh-supplier-categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await WHSupplierCategory.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create category
// @route   POST /api/v1/wh-supplier-categories
exports.createCategory = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const category = await WHSupplierCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
// @desc    Update category
// @route   PUT /api/v1/wh-supplier-categories/:id
exports.updateCategory = async (req, res) => {
    try {
        const category = await WHSupplierCategory.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/wh-supplier-categories/:id
exports.deleteCategory = async (req, res) => {
    try {
        const category = await WHSupplierCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
