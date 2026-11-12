const asyncHandler = require('../middleware/async');
const SalesReturn = require('../models/SalesReturn');
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const StockLog = require('../models/StockLog');
const mongoose = require('mongoose');

// @desc    Get all sales returns
// @route   GET /api/v1/sales-returns
// @access  Private (sales access)
exports.getSalesReturns = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.customerId) {
    query.customerId = req.query.customerId;
  }

  if (req.query.status) {
    query.status = req.query.status;
  }

  if (req.query.startDate || req.query.endDate) {
    query.date = {};
    if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setUTCHours(23, 59, 59, 999);
      query.date.$lte = end;
    }
  }

  const salesReturns = await SalesReturn.find(query)
    .populate('customerId', 'name email phone')
    .populate('saleId', 'invoiceNumber date')
    .populate('items.itemId', 'name sku')
    .populate('createdBy', 'name')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  const total = await SalesReturn.countDocuments(query);

  res.status(200).json({
    success: true,
    data: salesReturns,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      prev: page > 1 ? { page: page - 1 } : null,
      next: page < Math.ceil(total / limit) ? { page: page + 1 } : null
    }
  });
});

// @desc    Get single sales return
// @route   GET /api/v1/sales-returns/:id
// @access  Private (sales access)
exports.getSalesReturn = asyncHandler(async (req, res, next) => {
  const salesReturn = await SalesReturn.findById(req.params.id)
    .populate('customerId', 'name email phone address')
    .populate('saleId', 'invoiceNumber date items')
    .populate('items.itemId', 'name sku purchasePrice salePrice')
    .populate('createdBy', 'name');

  if (!salesReturn) {
    return res.status(404).json({
      success: false,
      message: 'Sales return not found'
    });
  }

  res.status(200).json({
    success: true,
    data: salesReturn
  });
});

// @desc    Create sales return
// @route   POST /api/v1/sales-returns
// @access  Private (sales access)
// @desc    Create sales return
// @route   POST /api/v1/sales-returns
// @access  Private (sales access)
exports.createSalesReturn = async (req, res) => {
  let session;
  try {
    session = await SalesReturn.startSession();
    session.startTransaction();

    // try {
    let { saleId, saleInvoice, customerId, items, returnMode, notes } = req.body;

    // Handle legacy/alternate field name from frontend
    if (!saleId && saleInvoice) {
      saleId = saleInvoice;
    }

    let sale = null;

    // Validate sale exists and belongs to customer ONLY if saleId is provided
    if (saleId) {
      sale = await Sale.findById(saleId).populate('items.item');
      if (!sale) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Sale invoice not found'
        });
      }

      // Sale model uses 'party', not 'customerId'
      const match = sale.party.toString() === customerId;
      console.log('🔍 Validating Sale Ownership:', match);

      if (!match) {
        console.log(`Mismatch: Sale(${saleId}) Party(${sale.party}) vs Selected(${customerId})`);

        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Sale does not belong to the selected customer (Sale Party: ${sale.party}, Selected: ${customerId})`
        });
      }
    }

    // Generate return invoice number or use provided
    const returnInvoiceNo = req.body.returnNo || req.body.returnInvoiceNo || await generateReturnInvoiceNumber();

    // Generate ID upfront to use in Stock Logs
    const returnId = new mongoose.Types.ObjectId();

    const processedItems = [];
    let totalReturnAmount = 0;

    for (const returnItem of items) {
      let saleItem = null;
      // Get price from payload, fallback to 0. Frontend sends salePrice or price.
      let itemPrice = returnItem.salePrice || returnItem.price || 0;
      let itemTaxPercent = returnItem.taxPercent || 0;

      // Frontend item ID might be in 'item' or 'itemId'
      const itemId = returnItem.itemId || returnItem.item;

      if (sale) {
        // Validate return quantities against original sale
        // Sale model uses 'item' field, SalesReturn uses 'itemId'
        saleItem = sale.items.find(sItem =>
          (sItem.item._id && sItem.item._id.toString() === itemId) ||
          (sItem.item.toString() === itemId)
        );

        if (!saleItem) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Item ${itemId} not found in original sale`
          });
        }

        // Check quantity limit (Sale model uses 'quantity')
        const soldQty = saleItem.quantity || saleItem.qty || 0;
        if (returnItem.returnQty > soldQty) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Return quantity (${returnItem.returnQty}) exceeds sold quantity (${soldQty}) for item`
          });
        }

        // Use price/tax from original sale to ensure accuracy
        itemPrice = saleItem.rate || saleItem.price || saleItem.salePrice || itemPrice;
      }

      const returnAmount = returnItem.returnQty * itemPrice;
      totalReturnAmount += returnAmount;

      processedItems.push({
        itemId: itemId,
        returnQty: returnItem.returnQty,
        price: itemPrice,
        taxPercent: itemTaxPercent,
        returnAmount
      });

      // Update item stock (increase on return)
      const dbItem = await Item.findByIdAndUpdate(
        itemId,
        { $inc: { stockQty: returnItem.returnQty } },
        { returnDocument: 'after', session }
      );

      // Create stock log with REAL returnId
      await StockLog.createLog({
        itemId: itemId,
        qty: returnItem.returnQty,
        type: 'in',
        refType: 'sale_return',
        refId: returnId,
        previousQty: dbItem.stockQty - returnItem.returnQty,
        newQty: dbItem.stockQty,
        createdBy: req.user.id,
        notes: `Sales return - ${returnInvoiceNo}`
      }, session);
    }

    // Create sales return
    const salesReturn = new SalesReturn({
      _id: returnId,
      saleId: saleId || undefined, // undefined if null/empty
      returnInvoiceNo,
      customerId,
      items: processedItems,
      totalReturnAmount,
      returnMode,
      status: 'completed',
      createdBy: req.user.id,
      notes
    });

    await salesReturn.save({ session });

    // Resolve Ledgers
    const Ledger = require('../models/Ledger');

    // Find Sales Return Ledger (System Account)
    let returnLedger = await Ledger.findOne({ ledgerName: 'Sales Return' }).session(session);
    if (!returnLedger) {
      returnLedger = new Ledger({
        ledgerName: 'Sales Return',
        ledgerType: 'return',
        createdBy: req.user.id
      });
      await returnLedger.save({ session });
    }

    // Find Customer Ledger
    let customerLedger = await Ledger.findOne({ refId: customerId, ledgerType: 'customer' }).session(session);

    if (!customerLedger) {
      // Auto-create ledger for customer if missing
      const party = await Party.findById(customerId).session(session);
      if (!party) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Check for name conflict
      const nameExists = await Ledger.findOne({ ledgerName: party.name }).session(session);
      const ledgerName = nameExists ? `${party.name} (${party.partyType})` : party.name;

      customerLedger = new Ledger({
        ledgerName: ledgerName,
        ledgerType: 'customer',
        refId: party._id,
        createdBy: req.user.id
      });
      await customerLedger.save({ session });
    }

    // Create ledger entries for double-entry accounting
    const ledgerEntries = [];

    // Debit Sales Returns account
    ledgerEntries.push({
      ledgerId: returnLedger._id,
      date: salesReturn.date,
      debit: totalReturnAmount,
      credit: 0,
      narration: `Sales Return - ${returnInvoiceNo}`,
      refType: 'sale_return',
      refId: salesReturn._id,
      createdBy: req.user.id
    });

    // Credit Customer account (reduce customer balance)
    ledgerEntries.push({
      ledgerId: customerLedger._id,
      date: salesReturn.date,
      debit: 0,
      credit: totalReturnAmount,
      narration: `Sales Return - ${returnInvoiceNo}`,
      refType: 'sale_return',
      refId: salesReturn._id,
      createdBy: req.user.id
    });

    // Create ledger entries
    await LedgerEntry.createDoubleEntry(ledgerEntries, session);

    await session.commitTransaction();

    const populatedReturn = await SalesReturn.findById(salesReturn._id)
      .populate('customerId', 'name email phone')
      .populate('saleId', 'invoiceNumber date')
      .populate('items.itemId', 'name sku')
      .populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      data: populatedReturn
    });

  } catch (error) {
    if (session) await session.abortTransaction();
    console.error('Sales return creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during sales return creation'
    });
  } finally {
    if (session) session.endSession();
  }
};

// @desc    Update sales return
// @route   PUT /api/v1/sales-returns/:id
// @access  Private (admin, manager)
exports.updateSalesReturn = asyncHandler(async (req, res, next) => {
  const salesReturn = await SalesReturn.findById(req.params.id);

  if (!salesReturn) {
    return res.status(404).json({
      success: false,
      message: 'Sales return not found'
    });
  }

  if (false && salesReturn.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: 'Cannot update completed sales return'
    });
  }

  const updatedSalesReturn = await SalesReturn.findByIdAndUpdate(
    req.params.id,
    req.body,
    { returnDocument: 'after', runValidators: true }
  ).populate('customerId', 'name email phone')
    .populate('saleId', 'invoiceNumber date')
    .populate('items.itemId', 'name sku');

  res.status(200).json({
    success: true,
    data: updatedSalesReturn
  });
});

// @desc    Delete sales return
// @route   DELETE /api/v1/sales-returns/:id
// @access  Private (admin only)
exports.deleteSalesReturn = asyncHandler(async (req, res, next) => {
  const session = await SalesReturn.startSession();
  session.startTransaction();

  try {
    const salesReturn = await SalesReturn.findById(req.params.id);

    if (!salesReturn) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Sales return not found'
      });
    }

    if (false && salesReturn.status === 'completed') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete completed sales return'
      });
    }

    // Reverse stock changes
    for (const item of salesReturn.items) {
      await Item.findByIdAndUpdate(
        item.itemId,
        { $inc: { stockQty: -item.returnQty } },
        { session }
      );

      // Create stock log for reversal
      await StockLog.createLog({
        itemId: item.itemId,
        qty: item.returnQty,
        type: 'out',
        refType: 'sale_return',
        refId: salesReturn._id,
        previousQty: 0, // Will be calculated
        newQty: 0, // Will be calculated
        createdBy: req.user.id,
        notes: `Sales return deletion reversal - ${salesReturn.returnInvoiceNo}`
      }, session);
    }

    // Delete related ledger entries
    await LedgerEntry.deleteMany(
      { refType: 'sale_return', refId: salesReturn._id },
      { session }
    );

    // Delete the sales return
    await SalesReturn.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Sales return deleted successfully'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Sales return deletion error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during sales return deletion'
    });
  } finally {
    session.endSession();
  }
});

// Helper function to generate return invoice number
async function generateReturnInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `SR${year}`;

  const lastReturn = await SalesReturn.findOne({
    returnInvoiceNo: { $regex: `^${prefix}` }
  }).sort({ returnInvoiceNo: -1 });

  let nextNumber = 1;

  if (lastReturn) {
    const lastNumber = parseInt(lastReturn.returnInvoiceNo.replace(prefix, ''));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}
