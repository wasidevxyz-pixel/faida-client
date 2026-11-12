const asyncHandler = require('../middleware/async');
const PurchaseReturn = require('../models/PurchaseReturn');
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const StockLog = require('../models/StockLog');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Get all purchase returns
// @route   GET /api/v1/purchase-returns
// @access  Private (admin, manager)
exports.getPurchaseReturns = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.supplierId) {
    query.supplierId = req.query.supplierId;
  }

  if (req.query.status) {
    query.status = req.query.status;
  }

  if (req.query.startDate || req.query.endDate) {
    query.date = {};
    if (req.query.startDate) {
      query.date.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);
      query.date.$lte = endDate;
    }
  }

  // Handle sorting if provided, else default to date desc
  let sort = { date: -1 };
  if (req.query.sort) {
    const parts = req.query.sort.split(',');
    sort = {};
    parts.forEach(part => {
      if (part.startsWith('-')) {
        sort[part.substring(1)] = -1;
      } else {
        sort[part] = 1;
      }
    });
  }

  const purchaseReturns = await PurchaseReturn.find(query)
    .populate('supplierId', 'name email phone')
    .populate('purchaseId', 'invoiceNo date')
    .populate('items.itemId', 'name sku')
    .populate('createdBy', 'name')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await PurchaseReturn.countDocuments(query);

  res.status(200).json({
    success: true,
    data: purchaseReturns,
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

// @desc    Get single purchase return
// @route   GET /api/v1/purchase-returns/:id
// @access  Private (admin, manager)
exports.getPurchaseReturn = asyncHandler(async (req, res) => {
  const purchaseReturn = await PurchaseReturn.findById(req.params.id)
    .populate('supplierId', 'name email phone address')
    .populate('purchaseId', 'invoiceNo date items')
    .populate('items.itemId', 'name sku purchasePrice')
    .populate('createdBy', 'name');

  if (!purchaseReturn) {
    return res.status(404).json({
      success: false,
      message: 'Purchase return not found'
    });
  }

  res.status(200).json({
    success: true,
    data: purchaseReturn
  });
});

// @desc    Create purchase return
// @route   POST /api/v1/purchase-returns
// @access  Private (admin, manager)
exports.createPurchaseReturn = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    let { purchaseInvoice, purchaseId, supplier, supplierId, items, returnMode, notes, returnNo, returnInvoiceNo } = req.body;

    const pId = purchaseId || purchaseInvoice;
    const sId = supplierId || supplier;
    const rInvoiceNo = returnInvoiceNo || returnNo;

    // Validate Supplier
    if (!sId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Supplier is required' });
    }

    // Validate Purchase Invoice (Optional)
    let purchase = null;
    if (pId) {
      purchase = await Purchase.findById(pId);
      if (!purchase) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
      }
      if (purchase.supplier && purchase.supplier.toString() !== sId) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Purchase invoice does not belong to selected supplier' });
      }
    }

    // Generate Return Invoice No
    const finalInvoiceNo = rInvoiceNo || await generateReturnInvoiceNumber();
    const returnId = new mongoose.Types.ObjectId();

    const processedItems = [];
    let totalReturnAmount = 0;

    // Process Items
    for (const returnItem of items) {
      const itemId = returnItem.itemId || returnItem.item;
      const qty = parseFloat(returnItem.returnQty || returnItem.quantity);
      const cost = parseFloat(returnItem.cost || returnItem.purchasePrice || returnItem.costPrice || 0);
      const taxPercent = parseFloat(returnItem.taxPercent || 0);

      // Calculate amount
      const subtotal = qty * cost;
      const taxAmount = (subtotal * taxPercent) / 100;
      const amount = subtotal + taxAmount;
      totalReturnAmount += amount;

      processedItems.push({
        itemId: itemId,
        returnQty: qty,
        cost: cost,
        taxPercent: taxPercent,
        returnAmount: amount
      });

      // Update Stock (OUT) & Log
      const itemDoc = await Item.findById(itemId).session(session);
      if (!itemDoc) throw new Error(`Item not found: ${itemId}`);

      if (itemDoc.stockQty < qty) {
        throw new Error(`Insufficient stock for item ${itemDoc.name}. Current: ${itemDoc.stockQty}, Returning: ${qty}`);
      }

      await Item.findByIdAndUpdate(itemId, { $inc: { stockQty: -qty } }, { session });

      await StockLog.createLog({
        itemId: itemId,
        qty: qty,
        type: 'out',
        refType: 'purchase_return',
        refId: returnId,
        previousQty: itemDoc.stockQty,
        newQty: itemDoc.stockQty - qty,
        createdBy: req.user.id,
        notes: `Purchase Return - ${finalInvoiceNo}`
      }, session);
    }

    // Create Purchase Return Record
    const newReturn = new PurchaseReturn({
      _id: returnId,
      purchaseId: pId || undefined,
      returnInvoiceNo: finalInvoiceNo,
      supplierId: sId,
      items: processedItems,
      totalReturnAmount,
      returnMode: returnMode || 'cash',
      status: 'completed',
      createdBy: req.user.id,
      notes
    });

    await newReturn.save({ session });

    // Ledger Entries
    const Ledger = require('../models/Ledger');
    let returnLedger = await Ledger.findOne({ ledgerName: 'Purchase Return' }).session(session);
    if (!returnLedger) {
      returnLedger = new Ledger({ ledgerName: 'Purchase Return', ledgerType: 'return', createdBy: req.user.id });
      await returnLedger.save({ session });
    }

    let supplierLedger = await Ledger.findOne({ refId: sId, ledgerType: 'supplier' }).session(session);
    if (!supplierLedger) {
      // Try finding generic ledger by name if special link missing, or create new
      const party = await Party.findById(sId).session(session);
      if (party) {
        supplierLedger = await Ledger.findOne({ ledgerName: party.name }).session(session);
        if (!supplierLedger) {
          supplierLedger = new Ledger({ ledgerName: party.name, ledgerType: 'supplier', refId: party._id, createdBy: req.user.id });
          await supplierLedger.save({ session });
        }
      }
    }

    if (supplierLedger && returnLedger) {
      await LedgerEntry.createDoubleEntry([
        {
          ledgerId: supplierLedger._id,
          date: newReturn.date,
          debit: totalReturnAmount, // Debit Supplier (Reduce Liability)
          credit: 0,
          narration: `Purchase Return - ${finalInvoiceNo}`,
          refType: 'purchase_return',
          refId: newReturn._id,
          createdBy: req.user.id
        },
        {
          ledgerId: returnLedger._id,
          date: newReturn.date,
          debit: 0,
          credit: totalReturnAmount, // Credit Purchase Return (Gain)
          narration: `Purchase Return - ${finalInvoiceNo}`,
          refType: 'purchase_return',
          refId: newReturn._id,
          createdBy: req.user.id
        }
      ], session);
    }

    await session.commitTransaction();
    res.status(201).json({ success: true, data: newReturn, message: 'Purchase return saved successfully' });

  } catch (error) {
    if (session) await session.abortTransaction();
    console.error('Create Purchase Return Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  } finally {
    if (session) session.endSession();
  }
};
/*
  // ORIGINAL CODE COMMENTED OUT FOR DEBUGGING
  try { require('fs').appendFileSync('debug_purchase_return.log', `DEBUG: Init createPurchaseReturn. Types: req=${typeof req}, res=${typeof res}, next=${typeof next}\n`); } catch (e) { }

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    require('fs').appendFileSync('debug_purchase_return.log', `DEBUG: Session started\n`);
  } catch (err) {
    require('fs').appendFileSync('debug_purchase_return.log', `DEBUG: Error starting session: ${err.message}\n`);
    return next(err);
  }
  // ... (Rest of the function)
*/

// @desc    Update purchase return
// @route   PUT /api/v1/purchase-returns/:id
// @access  Private (admin only)
// @desc    Update purchase return
// @route   PUT /api/v1/purchase-returns/:id
// @access  Private (admin only)
exports.updatePurchaseReturn = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const purchaseReturn = await PurchaseReturn.findById(req.params.id).session(session);

    if (!purchaseReturn) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Purchase return not found' });
    }

    // 1. REVERT OLD STOCK
    // Reverse stock changes (Add back to stock)
    for (const item of purchaseReturn.items) {
      await Item.findByIdAndUpdate(
        item.itemId,
        { $inc: { stockQty: item.returnQty } },
        { session }
      );

      await StockLog.createLog({
        itemId: item.itemId,
        qty: item.returnQty,
        type: 'in',
        refType: 'purchase_return',
        refId: purchaseReturn._id,
        previousQty: 0, // Simplified for brevity
        newQty: 0,
        createdBy: req.user.id,
        notes: `Purchase Return Update (Reversal) - ${purchaseReturn.returnInvoiceNo}`
      }, session);
    }

    // 2. DELETE OLD LEDGER ENTRIES
    await LedgerEntry.deleteMany({ refType: 'purchase_return', refId: purchaseReturn._id }, { session });

    // 3. PROCESS NEW DATA
    let { purchaseInvoice, purchaseId, supplier, supplierId, items, returnMode, notes, returnNo, returnInvoiceNo } = req.body;
    const pId = purchaseId || purchaseInvoice;
    const sId = supplierId || supplier;
    const rInvoiceNo = returnInvoiceNo || returnNo || purchaseReturn.returnInvoiceNo;

    const processedItems = [];
    let totalReturnAmount = 0;

    // Process New Items
    for (const returnItem of items) {
      const itemId = returnItem.itemId || returnItem.item;
      const qty = parseFloat(returnItem.returnQty || returnItem.quantity);
      const cost = parseFloat(returnItem.cost || returnItem.purchasePrice || returnItem.costPrice || 0);
      const taxPercent = parseFloat(returnItem.taxPercent || 0);

      const subtotal = qty * cost;
      const taxAmount = (subtotal * taxPercent) / 100;
      const amount = subtotal + taxAmount;
      totalReturnAmount += amount;

      processedItems.push({
        itemId: itemId,
        returnQty: qty,
        cost: cost,
        taxPercent: taxPercent,
        returnAmount: amount
      });

      // Update Stock (OUT) & Log
      const itemDoc = await Item.findById(itemId).session(session);
      if (!itemDoc) throw new Error(`Item not found: ${itemId}`);
      if (itemDoc.stockQty < qty) throw new Error(`Insufficient stock for item ${itemDoc.name}`);

      await Item.findByIdAndUpdate(itemId, { $inc: { stockQty: -qty } }, { session });

      await StockLog.createLog({
        itemId: itemId,
        qty: qty,
        type: 'out',
        refType: 'purchase_return',
        refId: purchaseReturn._id,
        previousQty: itemDoc.stockQty,
        newQty: itemDoc.stockQty - qty,
        createdBy: req.user.id,
        notes: `Purchase Return Update - ${rInvoiceNo}`
      }, session);
    }

    // 4. UPDATE RETURN DOC
    purchaseReturn.purchaseId = pId || undefined;
    purchaseReturn.supplierId = sId;
    purchaseReturn.items = processedItems;
    purchaseReturn.totalReturnAmount = totalReturnAmount;
    purchaseReturn.returnMode = returnMode || 'cash';
    purchaseReturn.notes = notes;
    purchaseReturn.returnInvoiceNo = rInvoiceNo;

    await purchaseReturn.save({ session });

    // 5. CREATE NEW LEDGER ENTRIES
    const Ledger = require('../models/Ledger');
    let returnLedger = await Ledger.findOne({ ledgerName: 'Purchase Return' }).session(session);
    if (!returnLedger) {
      returnLedger = new Ledger({ ledgerName: 'Purchase Return', ledgerType: 'return', createdBy: req.user.id });
      await returnLedger.save({ session });
    }

    let supplierLedger = await Ledger.findOne({ refId: sId, ledgerType: 'supplier' }).session(session);
    if (!supplierLedger) {
      const party = await Party.findById(sId).session(session);
      if (party) {
        supplierLedger = await Ledger.findOne({ ledgerName: party.name }).session(session);
        if (!supplierLedger) {
          supplierLedger = new Ledger({ ledgerName: party.name, ledgerType: 'supplier', refId: party._id, createdBy: req.user.id });
          await supplierLedger.save({ session });
        }
      }
    }

    if (supplierLedger && returnLedger) {
      await LedgerEntry.createDoubleEntry([
        {
          ledgerId: supplierLedger._id,
          date: purchaseReturn.date,
          debit: totalReturnAmount,
          credit: 0,
          narration: `Purchase Return Update - ${rInvoiceNo}`,
          refType: 'purchase_return',
          refId: purchaseReturn._id,
          createdBy: req.user.id
        },
        {
          ledgerId: returnLedger._id,
          date: purchaseReturn.date,
          debit: 0,
          credit: totalReturnAmount,
          narration: `Purchase Return Update - ${rInvoiceNo}`,
          refType: 'purchase_return',
          refId: purchaseReturn._id,
          createdBy: req.user.id
        }
      ], session);
    }

    await session.commitTransaction();
    res.status(200).json({ success: true, data: purchaseReturn, message: 'Purchase return updated successfully' });

  } catch (error) {
    if (session) await session.abortTransaction();
    console.error('Update Purchase Return Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  } finally {
    if (session) session.endSession();
  }
};

// @desc    Delete purchase return
// @route   DELETE /api/v1/purchase-returns/:id
// @access  Private (admin only)
exports.deletePurchaseReturn = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const purchaseReturn = await PurchaseReturn.findById(req.params.id).session(session);

    if (!purchaseReturn) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Purchase return not found', 404));
    }

    // if (purchaseReturn.status === 'completed') {
    //   await session.abortTransaction();
    //   session.endSession();
    //   return next(new ErrorResponse('Cannot delete completed purchase return', 400));
    // }

    // Reverse stock changes
    for (const item of purchaseReturn.items) {
      await Item.findByIdAndUpdate(
        item.itemId,
        { $inc: { stockQty: item.returnQty } },
        { session }
      );

      // Create stock log for reversal
      await StockLog.createLog({
        itemId: item.itemId,
        qty: item.returnQty,
        type: 'in',
        refType: 'purchase_return',
        refId: purchaseReturn._id,
        previousQty: 0, // Will be calculated
        newQty: 0, // Will be calculated
        createdBy: req.user.id,
        notes: `Purchase return deletion reversal - ${purchaseReturn.returnInvoiceNo}`
      }, session);
    }

    // Delete related ledger entries
    await LedgerEntry.deleteMany(
      { refType: 'purchase_return', refId: purchaseReturn._id },
      { session }
    );

    // Delete the purchase return
    await PurchaseReturn.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Purchase return deleted successfully'
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

// Helper function to generate return invoice number
async function generateReturnInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `PR${year}`;

  const lastReturn = await PurchaseReturn.findOne({
    returnInvoiceNo: { $regex: `^${prefix}` }
  }).sort({ returnInvoiceNo: -1 });

  let nextNumber = 1;

  if (lastReturn) {
    const lastNumber = parseInt(lastReturn.returnInvoiceNo.replace(prefix, ''));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}
