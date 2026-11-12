const express = require('express');
const router = express.Router();
const {
  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  receivePurchase,
  getPurchasesByDateRange,
  getPurchasesSummary
} = require('../controllers/purchaseController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Purchase = require('../models/Purchase');

// Re-route into other resource routers
// router.use('/:purchaseId/items', purchaseItemRoutes);

router
  .route('/')
  .get(protect, advancedResults(Purchase, [
    { path: 'supplier', select: 'name phone' },
    { path: 'items.item', select: 'name sku' }
  ]), getPurchases)
  .post(protect, authorize('admin', 'manager'), createPurchase);

router
  .route('/:id')
  .get(protect, getPurchase)
  .put(protect, authorize('admin', 'manager'), updatePurchase)
  .delete(protect, authorize('admin', 'manager'), deletePurchase);

router
  .route('/:id/receive')
  .put(protect, authorize('admin', 'manager'), receivePurchase);

router
  .route('/date-range')
  .get(protect, getPurchasesByDateRange);

router
  .route('/summary')
  .get(protect, getPurchasesSummary);

module.exports = router;
