const WHItemCategory = require('../models/WHItemCategory');

// @desc    Get all categories
// @route   GET /api/v1/wh-item-categories
exports.getCategories = async (req, res) => {
    try {
        let query = {};
        const isAdmin = req.user && (
            req.user.role === 'admin' ||
            req.user.role === 'administrator' ||
            req.user.role === 'superadmin' ||
            (req.user.groupId && req.user.groupId.isAdmin)
        );
        // Only restrict if user is not admin AND has specific categories assigned
        if (!isAdmin && req.user && req.user.allowedWHItemCategories && req.user.allowedWHItemCategories.length > 0) {
            query._id = { $in: req.user.allowedWHItemCategories };
        }
        const categories = await WHItemCategory.find(query).sort({ name: 1 });
        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create category
// @route   POST /api/v1/wh-item-categories
exports.createCategory = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const category = await WHItemCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update category
// @route   PUT /api/v1/wh-item-categories/:id
exports.updateCategory = async (req, res) => {
    try {
        const category = await WHItemCategory.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/wh-item-categories/:id
exports.deleteCategory = async (req, res) => {
    try {
        const category = await WHItemCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
