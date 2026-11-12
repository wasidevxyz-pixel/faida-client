const asyncHandler = require('../middleware/async');
const CustomerPayment = require('../models/CustomerPayment');
const Party = require('../models/Party');

// @desc    Get all customer payments
// @route   GET /api/v1/customer-payments
// @access  Private
exports.getCustomerPayments = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.query.customer) {
        query.customer = req.query.customer;
    }

    if (req.query.paymentMode) {
        query.paymentMode = req.query.paymentMode;
    }

    if (req.query.startDate || req.query.endDate) {
        query.date = {};
        if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
    }

    const total = await CustomerPayment.countDocuments(query);
    const payments = await CustomerPayment.find(query)
        .populate('customer', 'name phone email')
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

// @desc    Get single customer payment
// @route   GET /api/v1/customer-payments/:id
// @access  Private
exports.getCustomerPayment = asyncHandler(async (req, res, next) => {
    const payment = await CustomerPayment.findById(req.params.id)
        .populate('customer', 'name phone email address')
        .populate('createdBy', 'name');

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Customer payment not found'
        });
    }

    res.status(200).json({
        success: true,
        data: payment
    });
});

// @desc    Create new customer payment
// @route   POST /api/v1/customer-payments
// @access  Private
exports.createCustomerPayment = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;

    const customer = await Party.findById(req.body.customer);
    if (!customer) {
        return res.status(404).json({
            success: false,
            message: 'Customer not found'
        });
    }

    req.body.previousBalance = customer.balance || 0;

    const payment = await CustomerPayment.create(req.body);

    customer.balance = payment.balance;
    await customer.save();

    res.status(201).json({
        success: true,
        data: payment
    });
});

// @desc    Update customer payment
// @route   PUT /api/v1/customer-payments/:id
// @access  Private
exports.updateCustomerPayment = asyncHandler(async (req, res, next) => {
    let payment = await CustomerPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Customer payment not found'
        });
    }

    delete req.body.customer;
    delete req.body.createdBy;

    payment = await CustomerPayment.findByIdAndUpdate(
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

// @desc    Delete customer payment
// @route   DELETE /api/v1/customer-payments/:id
// @access  Private
exports.deleteCustomerPayment = asyncHandler(async (req, res, next) => {
    const payment = await CustomerPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Customer payment not found'
        });
    }

    const customer = await Party.findById(payment.customer);
    if (customer) {
        customer.balance = customer.balance + payment.amount + payment.discountAmount;
        await customer.save();
    }

    await payment.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});
