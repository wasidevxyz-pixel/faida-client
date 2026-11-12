const asyncHandler = require('../middleware/async');
const SupplierPayment = require('../models/SupplierPayment');
const Party = require('../models/Party');

// @desc    Get all supplier payments
// @route   GET /api/v1/supplier-payments
// @access  Private
exports.getSupplierPayments = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by supplier
    if (req.query.supplier) {
        query.supplier = req.query.supplier;
    }

    // Filter by payment mode
    if (req.query.paymentMode) {
        query.paymentMode = req.query.paymentMode;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
        query.date = {};
        if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
    }

    const total = await SupplierPayment.countDocuments(query);
    const payments = await SupplierPayment.find(query)
        .populate('supplier', 'name phone email')
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit);

    res.status(200).json({
        success: true,
        data: payments,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Get single supplier payment
// @route   GET /api/v1/supplier-payments/:id
// @access  Private
exports.getSupplierPayment = asyncHandler(async (req, res, next) => {
    const payment = await SupplierPayment.findById(req.params.id)
        .populate('supplier', 'name phone email address')
        .populate('createdBy', 'name');

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Supplier payment not found'
        });
    }

    res.status(200).json({
        success: true,
        data: payment
    });
});

// @desc    Create new supplier payment
// @route   POST /api/v1/supplier-payments
// @access  Private
exports.createSupplierPayment = asyncHandler(async (req, res, next) => {
    // Add user who created
    req.body.createdBy = req.user.id;

    // Get supplier's current balance
    const supplier = await Party.findById(req.body.supplier);
    if (!supplier) {
        return res.status(404).json({
            success: false,
            message: 'Supplier not found'
        });
    }

    req.body.previousBalance = supplier.balance || 0;

    const payment = await SupplierPayment.create(req.body);

    // Update supplier balance
    supplier.balance = payment.balance;
    await supplier.save();

    res.status(201).json({
        success: true,
        data: payment
    });
});

// @desc    Update supplier payment
// @route   PUT /api/v1/supplier-payments/:id
// @access  Private
exports.updateSupplierPayment = asyncHandler(async (req, res, next) => {
    let payment = await SupplierPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Supplier payment not found'
        });
    }

    // Don't allow changing supplier or createdBy
    delete req.body.supplier;
    delete req.body.createdBy;

    payment = await SupplierPayment.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
            returnDocument: 'after',
            runValidators: true
        }
    );

    res.status(200).json({
        success: true,
        data: payment
    });
});

// @desc    Delete supplier payment
// @route   DELETE /api/v1/supplier-payments/:id
// @access  Private
exports.deleteSupplierPayment = asyncHandler(async (req, res, next) => {
    const payment = await SupplierPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Supplier payment not found'
        });
    }

    // Reverse the balance update on supplier
    const supplier = await Party.findById(payment.supplier);
    if (supplier) {
        supplier.balance = supplier.balance + payment.amount + payment.discountAmount;
        await supplier.save();
    }

    await payment.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});
