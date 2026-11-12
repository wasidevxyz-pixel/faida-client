const Payment = require('../models/Payment');
const Party = require('../models/Party');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all payments
// @route   GET /api/v1/payments
// @access  Private
const getPayments = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single payment
// @route   GET /api/v1/payments/:id
// @access  Private
const getPayment = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id)
    .populate('party', 'name phone email');

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: payment });
});

// @desc    Create new payment
// @route   POST /api/v1/payments
// @access  Private
const createPayment = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  // Check if party exists
  const party = await Party.findById(req.body.party);
  if (!party) {
    return next(new ErrorResponse(`Party not found with id of ${req.body.party}`, 404));
  }

  // Create payment
  const payment = await Payment.create(req.body);

  // Update party balance if payment is completed
  if (payment.status === 'completed') {
    await party.updateBalance(payment.amount, 'subtract');
  }

  res.status(201).json({
    success: true,
    data: payment
  });
});

// @desc    Update payment
// @route   PUT /api/v1/payments/:id
// @access  Private
const updatePayment = asyncHandler(async (req, res, next) => {
  let payment = await Payment.findById(req.params.id);

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.id}`, 404));
  }

  // Only allow updates to draft payments
  if (payment.status !== 'draft') {
    return next(new ErrorResponse('Only draft payments can be updated', 400));
  }

  payment = await Payment.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: payment });
});

// @desc    Delete payment
// @route   DELETE /api/v1/payments/:id
// @access  Private
const deletePayment = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.id}`, 404));
  }

  // Only allow deletion of draft payments
  if (payment.status !== 'draft') {
    return next(new ErrorResponse('Only draft payments can be deleted', 400));
  }

  await payment.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Get payments by date range
// @route   GET /api/v1/payments/date-range
// @access  Private
const getPaymentsByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const payments = await Payment.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    status: 'completed'
  }).sort({ date: 1 });

  res.status(200).json({
    success: true,
    count: payments.length,
    data: payments
  });
});

// @desc    Get payments summary
// @route   GET /api/v1/payments/summary
// @access  Private
const getPaymentsSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = { status: 'completed' };

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: '$amount' },
        count: { $sum: 1 },
        averagePayment: { $avg: '$amount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalPayments: 0,
      count: 0,
      averagePayment: 0
    }
  });
});

module.exports = {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentsByDateRange,
  getPaymentsSummary
};
