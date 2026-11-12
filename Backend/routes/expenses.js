const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/expenseController');
const { protect, authorize, accountsAccess } = require('../middleware/auth');
const { expenseValidations, handleValidationErrors } = require('../middleware/validation');
const advancedResults = require('../middleware/advancedResults');
const Expense = require('../models/Expense');

// Static routes MUST come BEFORE dynamic routes like /:id
router
  .route('/cash-in-hand')
  .get(protect, accountsAccess, getCashInHand);

router
  .route('/date-range')
  .get(protect, accountsAccess, getExpensesByDateRange);

router
  .route('/summary')
  .get(protect, accountsAccess, getExpensesSummary);

router
  .route('/category/:category')
  .get(protect, accountsAccess, getExpensesByCategory);

// Main CRUD routes
router
  .route('/')
  .get(protect, accountsAccess, advancedResults(Expense, [
    { path: 'createdBy', select: 'name' },
    { path: 'approvedBy', select: 'name' }
  ]), getExpenses)
  .post(protect, accountsAccess, expenseValidations.create, handleValidationErrors, createExpense);

// Dynamic routes with :id AFTER static routes
router
  .route('/:id')
  .get(protect, accountsAccess, getExpense)
  .put(protect, accountsAccess, expenseValidations.update, handleValidationErrors, updateExpense)
  .delete(protect, authorize('admin', 'manager'), deleteExpense);

router
  .route('/:id/approve')
  .put(protect, authorize('admin', 'manager'), approveExpense);

module.exports = router;
