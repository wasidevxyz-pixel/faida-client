const express = require('express');
const router = express.Router();
const {
  getStockAdjustments,
  getStockAdjustment,
  createStockAdjustment,
  updateStockAdjustment,
  deleteStockAdjustment,
  approveStockAdjustment,
  getStockAdjustmentsByDateRange,
  getStockAdjustmentsSummary,
  getStockAdjustmentsByType
} = require('../controllers/stockAdjustmentController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const StockAdjustment = require('../models/StockAdjustment');

router
  .route('/')
  .get(protect, advancedResults(StockAdjustment, [
    { path: 'items.item', select: 'name sku' },
    { path: 'createdBy', select: 'name' },
    { path: 'approvedBy', select: 'name' }
  ]), getStockAdjustments)
  .post(protect, authorize('admin', 'manager', 'inventory'), createStockAdjustment);

router
  .route('/:id')
  .get(protect, getStockAdjustment)
  .put(protect, authorize('admin', 'manager', 'inventory'), updateStockAdjustment)
  .delete(protect, authorize('admin', 'manager'), deleteStockAdjustment);

router
  .route('/:id/approve')
  .put(protect, authorize('admin', 'manager'), approveStockAdjustment);

router
  .route('/date-range')
  .get(protect, getStockAdjustmentsByDateRange);

router
  .route('/type/:type')
  .get(protect, getStockAdjustmentsByType);

router
  .route('/summary')
  .get(protect, getStockAdjustmentsSummary);

module.exports = router;
