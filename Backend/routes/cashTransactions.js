const express = require('express');
const router = express.Router();
const {
  getCashTransactions,
  getCashTransaction,
  createCashTransaction,
  updateCashTransaction,
  deleteCashTransaction,
  getCashBookSummary
} = require('../controllers/cashTransactionController');
const { protect, accountsAccess, adminAccess, managerAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, accountsAccess, getCashTransactions)
  .post(protect, accountsAccess, createCashTransaction);

router
  .route('/summary')
  .get(protect, accountsAccess, getCashBookSummary);

router
  .route('/:id')
  .get(protect, accountsAccess, getCashTransaction)
  .put(protect, managerAccess, updateCashTransaction)
  .delete(protect, adminAccess, deleteCashTransaction);

module.exports = router;
