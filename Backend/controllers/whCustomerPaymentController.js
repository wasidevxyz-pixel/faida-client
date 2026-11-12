const WHCustomerPayment = require('../models/WHCustomerPayment');
const WHCustomer = require('../models/WHCustomer');
const Store = require('../models/Store');
const asyncHandler = require('../middleware/async');
const { addLedgerEntry, deleteLedgerEntry } = require('../utils/whLedgerUtils');



// @desc    Get all WH Customer Payments
// @route   GET /api/v1/wh-customer-payments
// @access  Private
exports.getWHCustomerPayments = asyncHandler(async (req, res) => {
    const { from, to, branch, customer } = req.query;
    let query = {};

    if (from && to) {
        query.date = {
            $gte: new Date(from),
            $lte: new Date(to)
        };
    }

    if (branch) query.branch = branch;
    if (customer) query.customer = customer;

    const payments = await WHCustomerPayment.find(query)
        .populate('customer', 'customerName')
        .populate('branch', 'name')
        .populate('createdBy', 'name')
        .sort({ date: -1 });

    res.status(200).json({
        success: true,
        count: payments.length,
        data: payments
    });
});


// @desc    Get single WH Customer Payment
// @route   GET /api/v1/wh-customer-payments/:id
// @access  Private
exports.getWHCustomerPayment = asyncHandler(async (req, res) => {
    const payment = await WHCustomerPayment.findById(req.params.id)
        .populate('customer')
        .populate('branch', 'name')
        .populate('createdBy', 'name');

    if (!payment) {
        return res.status(404).json({
            success: false,
            error: 'Payment voucher not found'
        });
    }

    res.status(200).json({
        success: true,
        data: payment
    });
});


// @desc    Create new WH Customer Payment
// @route   POST /api/v1/wh-customer-payments
// @access  Private
exports.createWHCustomerPayment = asyncHandler(async (req, res) => {
    const paymentData = {
        ...req.body,
        createdBy: req.user ? req.user._id : null
    };

    const payment = await WHCustomerPayment.create(paymentData);

    // Add Ledger Entry
    await addLedgerEntry({
        customer: payment.customer,
        date: payment.date,
        description: `${payment.paymentType} Payment - Receipt #${payment.receiptNo} (${payment.paymentMode})`,
        refType: 'Payment',
        refId: payment._id,
        debit: payment.paymentType === 'Pay' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        credit: payment.paymentType === 'Received' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        createdBy: req.user ? req.user._id : null
    });



    res.status(201).json({
        success: true,
        data: payment
    });
});



// @desc    Update WH Customer Payment
// @route   PUT /api/v1/wh-customer-payments/:id
// @access  Private
exports.updateWHCustomerPayment = asyncHandler(async (req, res) => {
    let payment = await WHCustomerPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            error: 'Payment voucher not found'
        });
    }

    // For updates, the simplest way is to delete old ledger and add new
    await deleteLedgerEntry(payment._id, {
        customer: payment.customer,
        debit: payment.paymentType === 'Pay' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        credit: payment.paymentType === 'Received' ? (payment.amount + (payment.discountAmount || 0)) : 0
    });

    payment = await WHCustomerPayment.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });

    // Add New Ledger Entry
    await addLedgerEntry({
        customer: payment.customer,
        date: payment.date,
        description: `${payment.paymentType} Payment (Updated) - Receipt #${payment.receiptNo} (${payment.paymentMode})`,
        refType: 'Payment',
        refId: payment._id,
        debit: payment.paymentType === 'Pay' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        credit: payment.paymentType === 'Received' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        createdBy: req.user ? req.user._id : null
    });


    res.status(200).json({
        success: true,
        data: payment
    });
});



// @desc    Delete WH Customer Payment
// @route   DELETE /api/v1/wh-customer-payments/:id
// @access  Private
exports.deleteWHCustomerPayment = asyncHandler(async (req, res) => {
    const payment = await WHCustomerPayment.findById(req.params.id);

    if (!payment) {
        return res.status(404).json({
            success: false,
            error: 'Payment voucher not found'
        });
    }

    // Reverse ledger and balance
    await deleteLedgerEntry(payment._id, {
        customer: payment.customer,
        debit: payment.paymentType === 'Pay' ? (payment.amount + (payment.discountAmount || 0)) : 0,
        credit: payment.paymentType === 'Received' ? (payment.amount + (payment.discountAmount || 0)) : 0
    });


    await payment.deleteOne();

    res.status(200).json({
        success: true,
        message: 'Payment voucher deleted successfully'
    });
});


