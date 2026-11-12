const Receipt = require('../models/Receipt');
const Party = require('../models/Party');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all receipts
// @route   GET /api/v1/receipts
// @access  Private
const getReceipts = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single receipt
// @route   GET /api/v1/receipts/:id
// @access  Private
const getReceipt = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('party', 'name phone email');

  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: receipt });
});

// @desc    Create new receipt
// @route   POST /api/v1/receipts
// @access  Private
const createReceipt = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  // Check if party exists
  const party = await Party.findById(req.body.party);
  if (!party) {
    return next(new ErrorResponse(`Party not found with id of ${req.body.party}`, 404));
  }

  // Create receipt
  const receipt = await Receipt.create(req.body);

  // Update party balance if receipt is completed
  if (receipt.status === 'completed') {
    await party.updateBalance(receipt.amount, 'add');
  }

  res.status(201).json({
    success: true,
    data: receipt
  });
});

// @desc    Update receipt
// @route   PUT /api/v1/receipts/:id
// @access  Private
const updateReceipt = asyncHandler(async (req, res, next) => {
  let receipt = await Receipt.findById(req.params.id);

  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id of ${req.params.id}`, 404));
  }

  // Only allow updates to draft receipts
  if (receipt.status !== 'draft') {
    return next(new ErrorResponse('Only draft receipts can be updated', 400));
  }

  receipt = await Receipt.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: receipt });
});

// @desc    Delete receipt
// @route   DELETE /api/v1/receipts/:id
// @access  Private
const deleteReceipt = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id);

  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id of ${req.params.id}`, 404));
  }

  // Only allow deletion of draft receipts
  if (receipt.status !== 'draft') {
    return next(new ErrorResponse('Only draft receipts can be deleted', 400));
  }

  await receipt.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Get receipts by date range
// @route   GET /api/v1/receipts/date-range
// @access  Private
const getReceiptsByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const receipts = await Receipt.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    status: 'completed'
  }).sort({ date: 1 });

  res.status(200).json({
    success: true,
    count: receipts.length,
    data: receipts
  });
});

// @desc    Get receipts summary
// @route   GET /api/v1/receipts/summary
// @access  Private
const getReceiptsSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = { status: 'completed' };

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await Receipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalReceipts: { $sum: '$amount' },
        count: { $sum: 1 },
        averageReceipt: { $avg: '$amount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalReceipts: 0,
      count: 0,
      averageReceipt: 0
    }
  });
});

module.exports = {
  getReceipts,
  getReceipt,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  getReceiptsByDateRange,
  getReceiptsSummary
};
