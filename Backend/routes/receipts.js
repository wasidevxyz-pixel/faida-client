const express = require('express');
const router = express.Router();
const {
  getReceipts,
  getReceipt,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  getReceiptsByDateRange,
  getReceiptsSummary
} = require('../controllers/receiptController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Receipt = require('../models/Receipt');

router
  .route('/')
  .get(protect, advancedResults(Receipt, [
    { path: 'customer', select: 'name phone' },
    { path: 'createdBy', select: 'name' }
  ]), getReceipts)
  .post(protect, authorize('admin', 'manager', 'accounts'), createReceipt);

router
  .route('/:id')
  .get(protect, getReceipt)
  .put(protect, authorize('admin', 'manager', 'accounts'), updateReceipt)
  .delete(protect, authorize('admin', 'manager'), deleteReceipt);

router
  .route('/date-range')
  .get(protect, getReceiptsByDateRange);

router
  .route('/summary')
  .get(protect, getReceiptsSummary);

module.exports = router;
