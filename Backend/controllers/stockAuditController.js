const asyncHandler = require('../middleware/async');
const StockAudit = require('../models/StockAudit');
const Item = require('../models/Item');

// @desc    Get all stock audits
// @route   GET /api/v1/stock-audits
// @access  Private
exports.getStockAudits = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    let query = {};

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
        query.date = {};
        if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
    }

    const total = await StockAudit.countDocuments(query);
    const audits = await StockAudit.find(query)
        .populate('createdBy', 'name')
        .populate({
            path: 'items.item',
            select: 'name code barcode category costPrice salePrice',
            populate: { path: 'category', select: 'name' }
        })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit);

    res.status(200).json({
        success: true,
        data: audits,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Get single stock audit
// @route   GET /api/v1/stock-audits/:id
// @access  Private
exports.getStockAudit = asyncHandler(async (req, res, next) => {
    const audit = await StockAudit.findById(req.params.id)
        .populate('items.item', 'name code barcode category')
        .populate('createdBy', 'name');

    if (!audit) {
        return res.status(404).json({
            success: false,
            message: 'Stock audit not found'
        });
    }

    res.status(200).json({
        success: true,
        data: audit
    });
});

// @desc    Create new stock audit
// @route   POST /api/v1/stock-audits
// @access  Private
exports.createStockAudit = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;

    const audit = await StockAudit.create(req.body);

    res.status(201).json({
        success: true,
        data: audit
    });
});

// @desc    Update stock audit
// @route   PUT /api/v1/stock-audits/:id
// @access  Private
exports.updateStockAudit = asyncHandler(async (req, res, next) => {
    let audit = await StockAudit.findById(req.params.id);

    if (!audit) {
        return res.status(404).json({
            success: false,
            message: 'Stock audit not found'
        });
    }

    if (audit.status === 'posted') {
        return res.status(400).json({
            success: false,
            message: 'Cannot update posted audit'
        });
    }

    // Update fields
    if (req.body.items) audit.items = req.body.items;
    if (req.body.date) audit.date = req.body.date;
    if (req.body.remarks) audit.remarks = req.body.remarks;

    await audit.save();

    res.status(200).json({
        success: true,
        data: audit
    });
});

// @desc    Delete stock audit
// @route   DELETE /api/v1/stock-audits/:id
// @access  Private
exports.deleteStockAudit = asyncHandler(async (req, res, next) => {
    const audit = await StockAudit.findById(req.params.id);

    if (!audit) {
        return res.status(404).json({
            success: false,
            message: 'Stock audit not found'
        });
    }

    if (audit.status === 'posted') {
        return res.status(400).json({
            success: false,
            message: 'Cannot delete posted audit'
        });
    }

    await audit.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});

// @desc    Post stock audit (Update actual stock)
// @route   POST /api/v1/stock-audits/:id/post
// @access  Private
exports.postStockAudit = asyncHandler(async (req, res, next) => {
    const audit = await StockAudit.findById(req.params.id);

    if (!audit) {
        return res.status(404).json({
            success: false,
            message: 'Stock audit not found'
        });
    }

    if (audit.status === 'posted') {
        return res.status(400).json({
            success: false,
            message: 'Audit already posted'
        });
    }

    // Update items stock
    for (const item of audit.items) {
        const product = await Item.findById(item.item);
        if (product) {
            // If difference is negative (physical < system), reduce stock
            // If difference is positive (physical > system), add stock
            // But actually we just want to SET stock to physicalQty? 
            // Or log the difference as adjustment?
            // Usually we create a StockAdjustment record or update Item `stock` directly.
            // Let's update stock directly for now.
            product.stock = item.physicalQty;
            await product.save();
        }
    }

    audit.status = 'posted';
    await audit.save();

    res.status(200).json({
        success: true,
        message: 'Stock audit posted successfully',
        data: audit
    });
});
