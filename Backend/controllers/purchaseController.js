const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const Party = require('../models/Party');
const Ledger = require('../models/Ledger');
const LedgerEntry = require('../models/LedgerEntry');
const StockLog = require('../models/StockLog');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Get all purchases
// @route   GET /api/v1/purchases
// @access  Private
const getPurchases = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single purchase
// @route   GET /api/v1/purchases/:id
// @access  Private
const getPurchase = asyncHandler(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id)
    .populate('supplier', 'name phone email')
    .populate('items.item', 'name sku')
    .lean();

  if (!purchase) {
    return next(new ErrorResponse(`Purchase not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: purchase });
});

// @desc    Create new purchase
// @route   POST /api/v1/purchases
// @access  Private
const createPurchase = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();

  // Set transaction options to handle write conflicts better
  const transactionOptions = {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary'
  };

  session.startTransaction(transactionOptions);

  try {
    // Add user to req.body
    req.body.createdBy = req.user.id;

    // Validate required fields
    if (!req.body.supplier) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Supplier is required', 400));
    }

    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('At least one item is required', 400));
    }

    // Check if supplier exists
    const supplier = await Party.findById(req.body.supplier).session(session);
    if (!supplier) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse(`Supplier not found with id of ${req.body.supplier}`, 404));
    }

    // Check if items exist
    for (const item of req.body.items) {
      if (!item.item) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Item ID is required for all items', 400));
      }
      const dbItem = await Item.findById(item.item).session(session);
      if (!dbItem) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
      }
    }

    // Map frontend field names to model field names
    if (req.body.discount !== undefined) {
      req.body.discountTotal = req.body.discount;
      delete req.body.discount;
    }
    if (req.body.taxAmount !== undefined) {
      req.body.taxTotal = req.body.taxAmount;
      delete req.body.taxAmount;
    }
    if (req.body.freight !== undefined) {
      req.body.shippingCharges = req.body.freight;
      delete req.body.freight;
    }
    if (req.body.misc !== undefined) {
      req.body.otherCharges = req.body.misc;
      delete req.body.misc;
    }

    // Map netTotal to grandTotal if grandTotal is not provided
    if (!req.body.grandTotal && req.body.netTotal) {
      req.body.grandTotal = req.body.netTotal;
    }

    // Remove fields not in schema
    delete req.body.billNo;
    delete req.body.discountPercent;
    delete req.body.taxPercent; // Remove taxPercent at purchase level (only in items)

    // Clean up items - remove discountPercent from items
    if (req.body.items && Array.isArray(req.body.items)) {
      req.body.items = req.body.items.map(item => {
        const cleanItem = { ...item };
        delete cleanItem.discountPercent;
        delete cleanItem.purchasePrice; // Use costPrice instead
        return cleanItem;
      });
    }

    // Calculate balanceAmount if not provided
    if (req.body.balanceAmount === undefined) {
      const grandTotal = req.body.grandTotal || req.body.netTotal || 0;
      const paidAmount = req.body.paidAmount || 0;
      req.body.balanceAmount = grandTotal - paidAmount;
    }

    // Calculate paymentStatus
    if (!req.body.paymentStatus) {
      const grandTotal = req.body.grandTotal || req.body.netTotal || 0;
      const paidAmount = req.body.paidAmount || 0;
      if (paidAmount === 0) {
        req.body.paymentStatus = 'unpaid';
      } else if (paidAmount >= grandTotal) {
        req.body.paymentStatus = 'paid';
      } else {
        req.body.paymentStatus = 'partial';
      }
    }

    // Generate invoice number if not provided (to avoid write conflicts in pre-save hook)
    if (!req.body.invoiceNo) {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const prefix = `PUR-${year}${month}-`;

      // Find the last invoice with this prefix (outside session for better concurrency)
      // Using readConcern to get the latest committed data
      const lastPurchase = await Purchase.findOne({
        invoiceNo: { $regex: `^${prefix}` }
      }).sort({ invoiceNo: -1 }).readConcern('majority').lean();

      let nextNumber = 1;
      if (lastPurchase && lastPurchase.invoiceNo) {
        const lastNumber = parseInt(lastPurchase.invoiceNo.split('-')[2]) || 0;
        nextNumber = lastNumber + 1;
      }

      req.body.invoiceNo = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    }

    // Create purchase with retry logic for write conflicts
    let createdPurchase;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        const purchaseDoc = new Purchase(req.body);
        // Ensure invoiceNo is set before saving
        if (!purchaseDoc.invoiceNo) {
          throw new Error('Invoice number is required');
        }
        createdPurchase = await purchaseDoc.save({ session });
        break; // Success, exit loop
      } catch (saveError) {
        lastError = saveError;
        console.error(`Purchase save attempt failed (${retries} retries left):`, saveError.message);

        // Handle duplicate key error or write conflict
        const isWriteConflict = saveError.code === 11000 ||
          saveError.message.includes('Write conflict') ||
          saveError.message.includes('duplicate key') ||
          saveError.message.includes('yielding is disabled');

        if (isWriteConflict) {
          retries--;
          if (retries > 0) {
            // Regenerate invoice number with timestamp to ensure uniqueness
            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            req.body.invoiceNo = `PUR-${year}${month}-${timestamp}${random}`;
            // Wait a bit before retrying to avoid immediate conflicts
            await new Promise(resolve => setTimeout(resolve, 200 * (4 - retries)));
          } else {
            // Last retry - use timestamp-based unique invoice number
            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const timestamp = Date.now().toString();
            req.body.invoiceNo = `PUR-${year}${month}-${timestamp}`;
            const purchaseDoc = new Purchase(req.body);
            createdPurchase = await purchaseDoc.save({ session });
          }
        } else {
          // Not a write conflict, throw the error immediately
          throw saveError;
        }
      }
    }

    if (!createdPurchase) {
      throw lastError || new Error('Failed to create purchase after retries');
    }

    // Set status to 'received' if not specified (so stock is updated immediately)
    if (!req.body.status) {
      createdPurchase.status = 'received';
      await createdPurchase.save({ session });
    }

    // Update inventory and supplier balance if status is 'received'
    if (createdPurchase.status === 'received') {
      // Update stock quantities and prices
      for (const item of createdPurchase.items) {
        // Get current stock quantity before updating
        const dbItem = await Item.findById(item.item).session(session);
        if (!dbItem) {
          throw new Error(`Item not found: ${item.item}`);
        }

        const previousQty = dbItem.stockQty || 0;
        const newQty = previousQty + item.quantity;

        // Update item stock
        await Item.findByIdAndUpdate(
          item.item,
          {
            $inc: { stockQty: item.quantity },
            $set: {
              purchasePrice: item.costPrice,
              salePrice: item.salePrice
            }
          },
          { session }
        );

        // Create stock log with required fields
        await StockLog.create([{
          itemId: item.item,
          type: 'in',
          qty: item.quantity,
          previousQty: previousQty,
          newQty: newQty,
          refType: 'purchase',
          refId: createdPurchase._id,
          date: createdPurchase.date,
          createdBy: req.user.id,
          notes: `Purchase Invoice #${createdPurchase.invoiceNo}`
        }], { session });
      }

      // Update supplier balance for credit purchases
      if (createdPurchase.paymentMode === 'credit') {
        await supplier.updateBalance(createdPurchase.balanceAmount, 'add', session);
      }

      // Create ledger entries
      await LedgerEntry.create([{
        ledgerId: supplier._id,
        date: createdPurchase.date,
        debit: 0,
        credit: createdPurchase.paymentMode === 'credit' ? createdPurchase.balanceAmount : 0,
        narration: `Purchase Invoice #${createdPurchase.invoiceNo}`,
        refType: 'purchase',
        refId: createdPurchase._id,
        createdBy: req.user.id
      }], { session });

      // Create purchase ledger entry
      const purchaseLedger = await Ledger.findOne({ ledgerType: 'purchase' }).session(session);
      if (purchaseLedger) {
        await LedgerEntry.create([{
          ledgerId: purchaseLedger._id,
          date: createdPurchase.date,
          debit: createdPurchase.grandTotal,
          credit: 0,
          narration: `Purchase Invoice #${createdPurchase.invoiceNo}`,
          refType: 'purchase',
          refId: createdPurchase._id,
          createdBy: req.user.id
        }], { session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: createdPurchase
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Log detailed error information
    if (process.env.NODE_ENV === 'development') {
        console.error('=== Purchase Creation Error ===');
        console.error('Error message:', error.message);
        console.error('Error name:', error.name);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }

    // Re-throw the error so asyncHandler can handle it properly
    // asyncHandler will catch this and call next(error)
    if (error instanceof ErrorResponse) {
      throw error;
    }

    // Create a proper ErrorResponse
    const errorMessage = error.message || 'Failed to create purchase';
    throw new ErrorResponse(errorMessage, 500);
  }
});

// @desc    Update purchase
// @route   PUT /api/v1/purchases/:id
// @access  Private
const updatePurchase = asyncHandler(async (req, res, next) => {
  let purchase = await Purchase.findById(req.params.id);

  if (!purchase) {
    return next(new ErrorResponse(`Purchase not found with id of ${req.params.id}`, 404));
  }

  // Check if items exist
  if (req.body.items) {
    for (const item of req.body.items) {
      const dbItem = await Item.findById(item.item);
      if (!dbItem) {
        return next(new ErrorResponse(`Item not found with id of ${item.item}`, 404));
      }
    }
  }

  // Update purchase
  purchase = await Purchase.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: purchase });
});

// @desc    Delete purchase
// @route   DELETE /api/v1/purchases/:id
// @access  Private
const deletePurchase = asyncHandler(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);

  if (!purchase) {
    return next(new ErrorResponse(`Purchase not found with id of ${req.params.id}`, 404));
  }

  await purchase.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Receive purchase
// @route   PUT /api/v1/purchases/:id/receive
// @access  Private
const receivePurchase = asyncHandler(async (req, res, next) => {
  let purchase = await Purchase.findById(req.params.id);

  if (!purchase) {
    return next(new ErrorResponse(`Purchase not found with id of ${req.params.id}`, 404));
  }

  // Check if purchase is in draft status
  if (purchase.status !== 'draft') {
    return next(new ErrorResponse('Only draft purchases can be received', 400));
  }

  // Update inventory
  for (const item of purchase.items) {
    await Item.findByIdAndUpdate(
      item.item,
      {
        $inc: { stockQty: item.quantity },
        $set: {
          purchasePrice: item.costPrice,
          salePrice: item.salePrice
        }
      }
    );
  }

  // Update supplier balance if it's a credit purchase
  if (purchase.paymentMode === 'credit') {
    const supplier = await Party.findById(purchase.supplier);
    if (supplier) {
      await supplier.updateBalance(purchase.balanceAmount, 'add');
    }
  }

  // Update purchase status
  purchase.status = 'received';
  purchase.receivedAt = Date.now();
  purchase.receivedBy = req.user.id;
  await purchase.save();

  res.status(200).json({ success: true, data: purchase });
});

// @desc    Get purchases by date range
// @route   GET /api/v1/purchases/date-range
// @access  Private
const getPurchasesByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const purchases = await Purchase.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    status: 'received'
  }).sort({ date: 1 }).lean();

  res.status(200).json({
    success: true,
    count: purchases.length,
    data: purchases
  });
});

// @desc    Get purchases summary
// @route   GET /api/v1/purchases/summary
// @access  Private
const getPurchasesSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = { status: 'received' };

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await Purchase.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: '$grandTotal' },
        totalItems: { $sum: { $size: '$items' } },
        totalTax: { $sum: '$taxTotal' },
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalPurchases: 0,
      totalItems: 0,
      totalTax: 0,
      count: 0
    }
  });
});

module.exports = {
  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  receivePurchase,
  getPurchasesByDateRange,
  getPurchasesSummary
};
