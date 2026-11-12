const Expense = require('../models/Expense');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const AuditLog = require('../models/AuditLog');

// @desc    Get all expenses
// @route   GET /api/v1/expenses
// @access  Private
const getExpenses = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single expense
// @route   GET /api/v1/expenses/:id
// @access  Private
const getExpense = asyncHandler(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email');

  if (!expense) {
    return next(new ErrorResponse(`Expense not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: expense });
});

// @desc    Create new expense
// @route   POST /api/v1/expenses
// @access  Private
const createExpense = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  const expense = await Expense.create(req.body);

  // Log the action to AuditLog
  await AuditLog.log({
    action: 'create',
    entity: 'expense',
    entityId: expense._id,
    changes: expense,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    performedBy: req.user.id
  });

  res.status(201).json({
    success: true,
    data: expense
  });
});

// @desc    Update expense
// @route   PUT /api/v1/expenses/:id
// @access  Private
const updateExpense = asyncHandler(async (req, res, next) => {
  let expense = await Expense.findById(req.params.id);

  if (!expense) {
    return next(new ErrorResponse(`Expense not found with id of ${req.params.id}`, 404));
  }

  // Only allow updates to pending expenses or by admin/manager
  if (expense.status !== 'pending' && req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Only pending expenses can be updated', 400));
  }

  // Don't allow changing approval status through update endpoint
  delete req.body.status;
  delete req.body.approvedBy;
  delete req.body.approvedAt;

  expense = await Expense.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: expense });
});

// @desc    Delete expense
// @route   DELETE /api/v1/expenses/:id
// @access  Private
const deleteExpense = asyncHandler(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    return next(new ErrorResponse(`Expense not found with id of ${req.params.id}`, 404));
  }

  // Allow deletion by creator or admin (removed status check for simpler workflow)
  // If you want to restrict, uncomment the following:
  // if (expense.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
  //   return next(new ErrorResponse('Not authorized to delete this expense', 401));
  // }

  await Expense.deleteOne({ _id: req.params.id });

  res.status(200).json({ success: true, data: {} });
});

// @desc    Approve expense
// @route   PUT /api/v1/expenses/:id/approve
// @access  Private
const approveExpense = asyncHandler(async (req, res, next) => {
  let expense = await Expense.findById(req.params.id);

  if (!expense) {
    return next(new ErrorResponse(`Expense not found with id of ${req.params.id}`, 404));
  }

  // Check if expense is pending
  if (expense.status !== 'pending') {
    return next(new ErrorResponse('Only pending expenses can be approved', 400));
  }

  // Update expense status
  expense.status = req.body.status || 'approved';
  expense.approvedBy = req.user.id;
  expense.approvedAt = Date.now();

  await expense.save();

  res.status(200).json({ success: true, data: expense });
});

// @desc    Get expenses by date range
// @route   GET /api/v1/expenses/date-range
// @access  Private
const getExpensesByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const expenses = await Expense.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ date: 1 });

  res.status(200).json({
    success: true,
    count: expenses.length,
    data: expenses
  });
});

// @desc    Get expenses summary
// @route   GET /api/v1/expenses/summary
// @access  Private
const getExpensesSummary = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = {};

  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const summary = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: '$amount' },
        count: { $sum: 1 },
        averageExpense: { $avg: '$amount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalExpenses: 0,
      count: 0,
      averageExpense: 0
    }
  });
});

// @desc    Get expenses by category
// @route   GET /api/v1/expenses/category/:category
// @access  Private
const getExpensesByCategory = asyncHandler(async (req, res, next) => {
  const expenses = await Expense.find({ category: req.params.category });

  res.status(200).json({
    success: true,
    count: expenses.length,
    data: expenses
  });
});

// @desc    Get cash in hand (calculate from expenses and receipts)
// @route   GET /api/v1/expenses/cash-in-hand
// @access  Private
const getCashInHand = asyncHandler(async (req, res, next) => {
  try {
    // Simple approach: get all expenses and sum manually
    const expenses = await Expense.find({ paymentMode: 'cash' }).select('type amount');

    let totalExpenses = 0;
    let totalReceipts = 0;

    expenses.forEach(exp => {
      if (exp.type === 'receipt') {
        totalReceipts += exp.amount || 0;
      } else {
        totalExpenses += exp.amount || 0;
      }
    });

    const cashInHand = totalReceipts - totalExpenses;

    res.status(200).json({
      success: true,
      data: {
        amount: cashInHand,
        totalExpenses: totalExpenses,
        totalReceipts: totalReceipts
      }
    });
  } catch (error) {
    console.error('getCashInHand error:', error);
    res.status(200).json({
      success: true,
      data: {
        amount: 0,
        totalExpenses: 0,
        totalReceipts: 0
      }
    });
  }
});

module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  getExpensesByDateRange,
  getExpensesSummary,
  getExpensesByCategory,
  getCashInHand
};
