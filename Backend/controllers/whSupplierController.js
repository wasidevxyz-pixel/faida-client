const WHSupplier = require('../models/WHSupplier');
const Store = require('../models/Store');

// @desc    Get next supplier code
// @route   GET /api/v1/wh-suppliers/next-code
// @access  Private
exports.getNextCode = async (req, res) => {
    try {
        const lastSupplier = await WHSupplier.findOne().sort({ code: -1 });
        let nextCode = '01';

        if (lastSupplier && lastSupplier.code) {
            const currentCode = parseInt(lastSupplier.code);
            if (!isNaN(currentCode)) {
                nextCode = (currentCode + 1).toString().padStart(2, '0');
            }
        }

        res.status(200).json({
            success: true,
            data: nextCode
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating next code',
            error: error.message
        });
    }
};

// @desc    Get all WH suppliers
// @route   GET /api/v1/wh-suppliers
// @access  Private
exports.getWHSuppliers = async (req, res) => {
    try {
        const { branch, search } = req.query;

        let query = {};
        if (branch) {
            query.branch = branch;
        }
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { supplierName: regex },
                { code: regex },
                { phone: regex },
                { mobile: regex }
            ];
        }

        const rawSuppliers = await WHSupplier.find(query)
            .populate('branch', 'name')
            .populate('supplierCategory', 'name')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const suppliers = rawSuppliers.map(s => {
            const sName = s.supplierName || s.name || '';
            return {
                ...s,
                supplierName: sName,
                name: sName
            };
        });

        res.status(200).json({
            success: true,
            count: suppliers.length,
            data: suppliers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching WH suppliers',
            error: error.message
        });
    }
};

// @desc    Get single WH supplier
// @route   GET /api/v1/wh-suppliers/:id
// @access  Private
exports.getWHSupplier = async (req, res) => {
    try {
        const supplier = await WHSupplier.findById(req.params.id)
            .populate('branch', 'name')
            .populate('createdBy', 'name email');

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'WH Supplier not found'
            });
        }

        res.status(200).json({
            success: true,
            data: supplier
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching WH supplier',
            error: error.message
        });
    }
};

// @desc    Create new WH supplier
// @route   POST /api/v1/wh-suppliers
// @access  Private
exports.createWHSupplier = async (req, res) => {
    try {
        // Add user to req.body
        req.body.createdBy = req.user.id;

        const supplier = await WHSupplier.create(req.body);

        res.status(201).json({
            success: true,
            message: 'WH Supplier created successfully',
            data: supplier
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating WH supplier',
            error: error.message
        });
    }
};

// @desc    Update WH supplier
// @route   PUT /api/v1/wh-suppliers/:id
// @access  Private
exports.updateWHSupplier = async (req, res) => {
    try {
        let supplier = await WHSupplier.findById(req.params.id);

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'WH Supplier not found'
            });
        }

        supplier = await WHSupplier.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: 'WH Supplier updated successfully',
            data: supplier
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating WH supplier',
            error: error.message
        });
    }
};

// @desc    Delete WH supplier
// @route   DELETE /api/v1/wh-suppliers/:id
// @access  Private
exports.deleteWHSupplier = async (req, res) => {
    try {
        const supplier = await WHSupplier.findById(req.params.id);

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'WH Supplier not found'
            });
        }

        await supplier.deleteOne();

        res.status(200).json({
            success: true,
            message: 'WH Supplier deleted successfully',
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting WH supplier',
            error: error.message
        });
    }
};
