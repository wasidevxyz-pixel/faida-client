const Sale = require('../models/Sale');
const Item = require('../models/Item');
const Party = require('../models/Party');
const Ledger = require('../models/Ledger');
const LedgerEntry = require('../models/LedgerEntry');
const StockLog = require('../models/StockLog');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

// @desc    Get all sales
// @route   GET /api/v1/sales
// @access  Private
const getSales = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single sale
// @route   GET /api/v1/sales/:id
// @access  Private
const getSale = asyncHandler(async (req, res, next) => {
  const sale = await Sale.findById(req.params.id)
    .populate('party', 'name code phone mobile email address taxNumber panNumber')
    .populate('items.item', 'name sku')
    .lean();

  if (!sale) {
    return next(new ErrorResponse(`Sale not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: sale });
});

// @desc    Create new sale
// @route   POST /api/v1/sales
// @access  Private
const createSale = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Add user to req.body
    req.body.createdBy = req.user.id;

    // Check if customer exists
    const customer = await Party.findById(req.body.party).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse(`Customer not found with id of ${req.body.party}`, 404));
    }

    // Check if items exist and have sufficient stock
    for (const item of req.body.items) {
      const dbItem = await Item.findById(item.item).session(session);
      if (!dbItem) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
      }

      if (dbItem.stockQty < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse(`Insufficient stock for item: ${dbItem.name}`, 400));
      }
    }

    // Check credit limit for credit sales
    if (req.body.paymentMode === 'credit') {
      if (!customer.checkCreditLimit(req.body.grandTotal)) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Credit limit exceeded', 400));
      }
    }

    // Set default status to 'final' if not specified
    if (!req.body.status) {
      req.body.status = 'final';
    }

    // Create sale
    const sale = await Sale.create([req.body], { session });
    const createdSale = sale[0];

    // Update inventory and customer balance if sale is final
    if (createdSale.status === 'final') {
      // Update stock quantities
      for (const item of createdSale.items) {
        // Get current stock quantity before updating
        const dbItem = await Item.findById(item.item).session(session);
        if (!dbItem) {
          throw new Error(`Item not found: ${item.item}`);
        }

        const previousQty = dbItem.stockQty || 0;
        const newQty = Math.max(0, previousQty - item.quantity); // Ensure non-negative

        await Item.findByIdAndUpdate(
          item.item,
          { $inc: { stockQty: -item.quantity } },
          { session }
        );

        // Create stock log with required fields
        await StockLog.create([{
          itemId: item.item,
          type: 'out',
          qty: item.quantity,
          previousQty: previousQty,
          newQty: newQty,
          refType: 'sale',
          refId: createdSale._id,
          date: createdSale.date,
          createdBy: req.user.id,
          notes: `Sale Invoice #${createdSale.invoiceNo}`
        }], { session });
      }

      // Update customer balance for credit sales
      if (createdSale.paymentMode === 'credit') {
        await customer.updateBalance(createdSale.balanceAmount, 'add', session);
      }

      // Create ledger entries
      await LedgerEntry.create([{
        ledgerId: customer._id,
        date: createdSale.date,
        debit: createdSale.paymentMode === 'credit' ? createdSale.balanceAmount : 0,
        credit: 0,
        narration: `Sale Invoice #${createdSale.invoiceNo}`,
        refType: 'sale',
        refId: createdSale._id,
        createdBy: req.user.id
      }], { session });

      // Create sales ledger entry
      const salesLedger = await Ledger.findOne({ ledgerType: 'sales' }).session(session);
      if (salesLedger) {
        await LedgerEntry.create([{
          ledgerId: salesLedger._id,
          date: createdSale.date,
          debit: 0,
          credit: createdSale.grandTotal,
          narration: `Sale Invoice #${createdSale.invoiceNo}`,
          refType: 'sale',
          refId: createdSale._id,
          createdBy: req.user.id
        }], { session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    // Log the action to AuditLog
    await AuditLog.log({
      action: 'create',
      entity: 'sale',
      entityId: createdSale._id,
      changes: createdSale,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      performedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: createdSale
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

// @desc    Update sale
// @route   PUT /api/v1/sales/:id
// @access  Private
// @desc    Update sale
// @route   PUT /api/v1/sales/:id
// @access  Private
const updateSale = asyncHandler(async (req, res, next) => {
  let sale = await Sale.findById(req.params.id);

  if (!sale) {
    return next(new ErrorResponse(`Sale not found with id of ${req.params.id}`, 404));
  }

  // Prevent createdBy from being overwritten with null/undefined
  if (req.body.createdBy === null || req.body.createdBy === undefined) {
    delete req.body.createdBy;
  }

  // Check if items exist and have sufficient stock
  if (req.body.items) {
    for (const item of req.body.items) {
      const dbItem = await Item.findById(item.item);
      if (!dbItem) {
        return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
      }

      // Check if updating an existing item or adding a new one
      const existingItem = sale.items.find(i => i.item.toString() === item.item);
      const currentQty = existingItem ? existingItem.quantity : 0;
      const qtyChange = item.quantity - currentQty;

      if (dbItem.stockQty < qtyChange) {
        return next(new ErrorResponse(`Insufficient stock for item: ${dbItem.name}`, 400));
      }
    }
  }

  // Update sale
  sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: sale });
});

// @desc    Delete sale
// @route   DELETE /api/v1/sales/:id
// @access  Private
const deleteSale = asyncHandler(async (req, res, next) => {
  const sale = await Sale.findById(req.params.id);

  if (!sale) {
    return next(new ErrorResponse(`Sale not found with id of ${req.params.id}`, 404));
  }

  // Use deleteOne() instead of remove() (deprecated)
  await Sale.deleteOne({ _id: req.params.id });

  res.status(200).json({ success: true, data: {} });
});



// @desc    Get sales by date range
// @route   GET /api/v1/sales/date-range
// @access  Private
const getSalesByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const sales = await Sale.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    status: 'final'
  }).sort({ date: 1 }).lean();

  res.status(200).json({
    success: true,
    count: sales.length,
    data: sales
  });
});

// @desc    Get sales summary
// @route   GET /api/v1/sales/summary
// @access  Private
const getSalesSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = { status: 'final' };

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$grandTotal' },
        totalItems: { $sum: { $size: '$items' } },
        totalTax: { $sum: '$taxTotal' },
        totalDiscount: { $sum: '$discountTotal' },
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalSales: 0,
      totalItems: 0,
      totalTax: 0,
      totalDiscount: 0,
      count: 0
    }
  });
});

module.exports = {
  getSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  getSalesByDateRange,
  getSalesSummary
};
