const CommissionSupplier = require('../models/CommissionSupplier');

// @desc    Get all suppliers
// @route   GET /api/v1/commission-suppliers
// @access  Private
exports.getSuppliers = async (req, res) => {
    try {
        const suppliers = await CommissionSupplier.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: suppliers.length, data: suppliers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Create supplier
// @route   POST /api/v1/commission-suppliers
// @access  Private
exports.createSupplier = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const supplier = await CommissionSupplier.create(req.body);
        res.status(201).json({ success: true, data: supplier });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Supplier already exists' });
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Update supplier
// @route   PUT /api/v1/commission-suppliers/:id
// @access  Private
exports.updateSupplier = async (req, res) => {
    try {
        const supplier = await CommissionSupplier.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }
        res.status(200).json({ success: true, data: supplier });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Delete supplier
// @route   DELETE /api/v1/commission-suppliers/:id
// @access  Private
exports.deleteSupplier = async (req, res) => {
    try {
        const supplier = await CommissionSupplier.findByIdAndDelete(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
