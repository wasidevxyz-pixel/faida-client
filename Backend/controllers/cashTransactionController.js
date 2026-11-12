const asyncHandler = require('../middleware/async');
const CashTransaction = require('../models/CashTransaction');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');

// @desc    Get all cash transactions
// @route   GET /api/v1/cash-transactions
// @access  Private (accounts access)
exports.getCashTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.type) {
    query.type = req.query.type;
  }

  if (req.query.refType) {
    query.refType = req.query.refType;
  }

  if (req.query.partyId) {
    query.partyId = req.query.partyId;
  }

  if (req.query.startDate || req.query.endDate) {
    query.date = {};
    if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
  }

  const transactions = await CashTransaction.find(query)
    .populate('partyId', 'name email phone')
    .populate('createdBy', 'name')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  const total = await CashTransaction.countDocuments(query);

  res.status(200).json({
    success: true,
    data: transactions,
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

// @desc    Get single cash transaction
// @route   GET /api/v1/cash-transactions/:id
// @access  Private (accounts access)
exports.getCashTransaction = asyncHandler(async (req, res) => {
  const transaction = await CashTransaction.findById(req.params.id)
    .populate('partyId', 'name email phone address')
    .populate('createdBy', 'name');

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Cash transaction not found'
    });
  }

  res.status(200).json({
    success: true,
    data: transaction
  });
});

// @desc    Create cash transaction
// @route   POST /api/v1/cash-transactions
// @access  Private (accounts access)
exports.createCashTransaction = asyncHandler(async (req, res) => {
  const session = await CashTransaction.startSession();
  session.startTransaction();

  try {
    const { date, type, refType, refId, amount, narration, partyId } = req.body;

    // Get or create cash ledger
    const cashLedger = await Ledger.findOne({ ledgerType: 'cash' });
    if (!cashLedger) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cash ledger not found'
      });
    }

    // Create cash transaction
    const transaction = new CashTransaction({
      date: date || new Date(),
      type,
      refType,
      refId,
      amount,
      narration,
      partyId,
      createdBy: req.user.id
    });

    await transaction.save({ session });

    // Create ledger entry for cash account
    const ledgerEntry = new LedgerEntry({
      ledgerId: cashLedger._id,
      date: transaction.date,
      debit: type === 'payment' ? amount : 0,
      credit: type === 'receipt' ? amount : 0,
      narration,
      refType: `cash_${type}`,
      refId: transaction._id,
      createdBy: req.user.id
    });

    await ledgerEntry.save({ session });

    // Update cash ledger balance
    if (type === 'payment') {
      cashLedger.currentBalance += amount;
    } else {
      cashLedger.currentBalance -= amount;
    }
    await cashLedger.save({ session });

    await session.commitTransaction();

    const populatedTransaction = await CashTransaction.findById(transaction._id)
      .populate('partyId', 'name email phone')
      .populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      data: populatedTransaction
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Cash transaction creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during cash transaction creation'
    });
  } finally {
    session.endSession();
  }
});

// @desc    Update cash transaction
// @route   PUT /api/v1/cash-transactions/:id
// @access  Private (admin, manager)
exports.updateCashTransaction = asyncHandler(async (req, res) => {
  const session = await CashTransaction.startSession();
  session.startTransaction();

  try {
    const transaction = await CashTransaction.findById(req.params.id);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Cash transaction not found'
      });
    }

    const oldAmount = transaction.amount;
    const oldType = transaction.type;
    const { amount, type, narration, partyId } = req.body;

    // Update transaction
    const updatedTransaction = await CashTransaction.findByIdAndUpdate(
      req.params.id,
      { amount, type, narration, partyId },
      { returnDocument: 'after', runValidators: true, session }
    );

    // Update corresponding ledger entry
    const ledgerEntry = await LedgerEntry.findOne({
      refType: `cash_${oldType}`,
      refId: transaction._id
    });

    if (ledgerEntry) {
      // Reverse old entry
      const cashLedger = await Ledger.findById(ledgerEntry.ledgerId);
      if (oldType === 'payment') {
        cashLedger.currentBalance -= oldAmount;
      } else {
        cashLedger.currentBalance += oldAmount;
      }

      // Apply new entry
      if (type === 'payment') {
        cashLedger.currentBalance += amount;
        ledgerEntry.debit = amount;
        ledgerEntry.credit = 0;
      } else {
        cashLedger.currentBalance -= amount;
        ledgerEntry.debit = 0;
        ledgerEntry.credit = amount;
      }

      ledgerEntry.narration = narration;
      ledgerEntry.refType = `cash_${type}`;
      await ledgerEntry.save({ session });
      await cashLedger.save({ session });
    }

    await session.commitTransaction();

    const populatedTransaction = await CashTransaction.findById(updatedTransaction._id)
      .populate('partyId', 'name email phone')
      .populate('createdBy', 'name');

    res.status(200).json({
      success: true,
      data: populatedTransaction
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Cash transaction update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during cash transaction update'
    });
  } finally {
    session.endSession();
  }
});

// @desc    Delete cash transaction
// @route   DELETE /api/v1/cash-transactions/:id
// @access  Private (admin only)
exports.deleteCashTransaction = asyncHandler(async (req, res) => {
  const session = await CashTransaction.startSession();
  session.startTransaction();

  try {
    const transaction = await CashTransaction.findById(req.params.id);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Cash transaction not found'
      });
    }

    // Update cash ledger balance
    const ledgerEntry = await LedgerEntry.findOne({
      refType: `cash_${transaction.type}`,
      refId: transaction._id
    });

    if (ledgerEntry) {
      const cashLedger = await Ledger.findById(ledgerEntry.ledgerId);
      if (transaction.type === 'payment') {
        cashLedger.currentBalance -= transaction.amount;
      } else {
        cashLedger.currentBalance += transaction.amount;
      }
      await cashLedger.save({ session });
    }

    // Delete ledger entry
    await LedgerEntry.deleteOne(
      { refType: `cash_${transaction.type}`, refId: transaction._id },
      { session }
    );

    // Delete transaction
    await CashTransaction.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Cash transaction deleted successfully'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Cash transaction deletion error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during cash transaction deletion'
    });
  } finally {
    session.endSession();
  }
});

// @desc    Get cash book summary
// @route   GET /api/v1/cash-transactions/summary
// @access  Private (accounts access)
exports.getCashBookSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  // Get cash ledger balance
  const cashLedger = await Ledger.findOne({ ledgerType: 'cash' });
  const currentBalance = cashLedger ? cashLedger.currentBalance : 0;

  // Get transaction summary
  const summary = await CashTransaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get daily totals
  const dailyTotals = await CashTransaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        receipts: {
          $sum: { $cond: [{ $eq: ['$type', 'receipt'] }, '$amount', 0] }
        },
        payments: {
          $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] }
        },
        net: { $sum: { $cond: [{ $eq: ['$type', 'receipt'] }, '$amount', { $multiply: ['$amount', -1] }] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      currentBalance,
      summary: summary.reduce((acc, item) => {
        acc[item._id] = {
          totalAmount: item.totalAmount,
          count: item.count
        };
        return acc;
      }, {}),
      dailyTotals
    }
  });
});
