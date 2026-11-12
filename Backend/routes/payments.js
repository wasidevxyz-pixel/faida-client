const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentsByDateRange,
  getPaymentsSummary
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Payment = require('../models/Payment');

router
  .route('/')
  .get(protect, advancedResults(Payment, [
    { path: 'supplier', select: 'name phone' },
    { path: 'createdBy', select: 'name' }
  ]), getPayments)
  .post(protect, authorize('admin', 'manager', 'accounts'), createPayment);

router
  .route('/:id')
  .get(protect, getPayment)
  .put(protect, authorize('admin', 'manager', 'accounts'), updatePayment)
  .delete(protect, authorize('admin', 'manager'), deletePayment);

router
  .route('/date-range')
  .get(protect, getPaymentsByDateRange);

router
  .route('/summary')
  .get(protect, getPaymentsSummary);

module.exports = router;
