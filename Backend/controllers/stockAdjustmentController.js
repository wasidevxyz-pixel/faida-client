const StockAdjustment = require('../models/StockAdjustment');
const Item = require('../models/Item');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all stock adjustments
// @route   GET /api/v1/stock-adjustments
// @access  Private
const getStockAdjustments = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single stock adjustment
// @route   GET /api/v1/stock-adjustments/:id
// @access  Private
const getStockAdjustment = asyncHandler(async (req, res, next) => {
  const stockAdjustment = await StockAdjustment.findById(req.params.id)
    .populate('items.item', 'name sku')
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email');

  if (!stockAdjustment) {
    return next(new ErrorResponse(`Stock adjustment not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: stockAdjustment });
});

// @desc    Create new stock adjustment
// @route   POST /api/v1/stock-adjustments
// @access  Private
const createStockAdjustment = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  // Check if items exist and get current stock
  for (const item of req.body.items) {
    const dbItem = await Item.findById(item.item);
    if (!dbItem) {
      return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
    }

    // Set current stock and calculate new stock
    item.currentStock = dbItem.stockQty;

    // Calculate quantity based on adjustment type
    if (req.body.adjustmentType === 'addition' || req.body.adjustmentType === 'found') {
      item.quantity = Math.abs(item.quantity);
      item.newStock = item.currentStock + item.quantity;
    } else if (req.body.adjustmentType === 'deduction' || req.body.adjustmentType === 'damage' || req.body.adjustmentType === 'expired') {
      item.quantity = -Math.abs(item.quantity);
      item.newStock = item.currentStock + item.quantity;

      // Check if deduction exceeds current stock
      if (item.newStock < 0) {
        return next(new ErrorResponse(`Cannot deduct more than current stock for item: ${dbItem.name}`, 400));
      }
    }

    // Set rate and total
    item.rate = dbItem.purchasePrice || 0;
    item.total = Math.abs(item.quantity) * item.rate;
  }

  // Calculate total amount
  req.body.totalAmount = req.body.items.reduce((sum, item) => sum + item.total, 0);

  const stockAdjustment = await StockAdjustment.create(req.body);

  res.status(201).json({
    success: true,
    data: stockAdjustment
  });
});

// @desc    Update stock adjustment
// @route   PUT /api/v1/stock-adjustments/:id
// @access  Private
const updateStockAdjustment = asyncHandler(async (req, res, next) => {
  let stockAdjustment = await StockAdjustment.findById(req.params.id);

  if (!stockAdjustment) {
    return next(new ErrorResponse(`Stock adjustment not found with id of ${req.params.id}`, 404));
  }

  // Only allow updates to draft adjustments
  if (stockAdjustment.status !== 'draft') {
    return next(new ErrorResponse('Only draft stock adjustments can be updated', 400));
  }

  // Recalculate items if provided
  if (req.body.items) {
    for (const item of req.body.items) {
      const dbItem = await Item.findById(item.item);
      if (!dbItem) {
        return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
      }

      // Recalculate based on adjustment type
      if (stockAdjustment.adjustmentType === 'addition' || stockAdjustment.adjustmentType === 'found') {
        item.quantity = Math.abs(item.quantity);
        item.newStock = item.currentStock + item.quantity;
      } else if (stockAdjustment.adjustmentType === 'deduction' || stockAdjustment.adjustmentType === 'damage' || stockAdjustment.adjustmentType === 'expired') {
        item.quantity = -Math.abs(item.quantity);
        item.newStock = item.currentStock + item.quantity;
      }

      item.rate = dbItem.purchasePrice || 0;
      item.total = Math.abs(item.quantity) * item.rate;
    }

    req.body.totalAmount = req.body.items.reduce((sum, item) => sum + item.total, 0);
  }

  stockAdjustment = await StockAdjustment.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: stockAdjustment });
});

// @desc    Delete stock adjustment
// @route   DELETE /api/v1/stock-adjustments/:id
// @access  Private
const deleteStockAdjustment = asyncHandler(async (req, res, next) => {
  const stockAdjustment = await StockAdjustment.findById(req.params.id);

  if (!stockAdjustment) {
    return next(new ErrorResponse(`Stock adjustment not found with id of ${req.params.id}`, 404));
  }

  // Only allow deletion of draft adjustments
  if (stockAdjustment.status !== 'draft') {
    return next(new ErrorResponse('Only draft stock adjustments can be deleted', 400));
  }

  await stockAdjustment.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Approve stock adjustment
// @route   PUT /api/v1/stock-adjustments/:id/approve
// @access  Private
const approveStockAdjustment = asyncHandler(async (req, res, next) => {
  let stockAdjustment = await StockAdjustment.findById(req.params.id);

  if (!stockAdjustment) {
    return next(new ErrorResponse(`Stock adjustment not found with id of ${req.params.id}`, 404));
  }

  // Check if adjustment is in draft status
  if (stockAdjustment.status !== 'draft') {
    return next(new ErrorResponse('Only draft stock adjustments can be approved', 400));
  }

  // Update inventory
  for (const item of stockAdjustment.items) {
    await Item.findByIdAndUpdate(
      item.item,
      { $inc: { stockQty: item.quantity } }
    );
  }

  // Update adjustment status
  stockAdjustment.status = 'approved';
  stockAdjustment.approvedBy = req.user.id;
  stockAdjustment.approvedAt = Date.now();

  await stockAdjustment.save();

  res.status(200).json({ success: true, data: stockAdjustment });
});

// @desc    Get stock adjustments by date range
// @route   GET /api/v1/stock-adjustments/date-range
// @access  Private
const getStockAdjustmentsByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const stockAdjustments = await StockAdjustment.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ date: 1 });

  res.status(200).json({
    success: true,
    count: stockAdjustments.length,
    data: stockAdjustments
  });
});

// @desc    Get stock adjustments summary
// @route   GET /api/v1/stock-adjustments/summary
// @access  Private
const getStockAdjustmentsSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = {};

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await StockAdjustment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAdjustments: { $sum: '$totalAmount' },
        count: { $sum: 1 },
        averageAdjustment: { $avg: '$totalAmount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalAdjustments: 0,
      count: 0,
      averageAdjustment: 0
    }
  });
});

// @desc    Get stock adjustments by type
// @route   GET /api/v1/stock-adjustments/type/:type
// @access  Private
const getStockAdjustmentsByType = asyncHandler(async (req, res, next) => {
  const stockAdjustments = await StockAdjustment.find({ adjustmentType: req.params.type });

  res.status(200).json({
    success: true,
    count: stockAdjustments.length,
    data: stockAdjustments
  });
});

module.exports = {
  getStockAdjustments,
  getStockAdjustment,
  createStockAdjustment,
  updateStockAdjustment,
  deleteStockAdjustment,
  approveStockAdjustment,
  getStockAdjustmentsByDateRange,
  getStockAdjustmentsSummary,
  getStockAdjustmentsByType
};
