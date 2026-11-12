const express = require('express');
const router = express.Router();
const {
  getSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  getSalesByDateRange,
  getSalesSummary
} = require('../controllers/saleController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Sale = require('../models/Sale');

// Re-route into other resource routers
// router.use('/:saleId/items', saleItemRoutes);

router
  .route('/')
  .get(protect, advancedResults(Sale, [
    { path: 'party', select: 'name phone' },
    { path: 'items.item', select: 'name sku' }
  ]), getSales)
  .post(protect, authorize('admin', 'manager', 'sales'), createSale);

router
  .route('/:id')
  .get(getSale)
  .put(protect, authorize('admin', 'manager'), updateSale)
  .delete(protect, authorize('admin', 'manager'), deleteSale);

router
  .route('/date-range')
  .get(protect, getSalesByDateRange);

router
  .route('/summary')
  .get(protect, getSalesSummary);

module.exports = router;
