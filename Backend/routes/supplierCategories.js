const express = require('express');
const router = express.Router();
const {
    getSupplierCategories,
    getSupplierCategory,
    createSupplierCategory,
    updateSupplierCategory,
    deleteSupplierCategory
} = require('../controllers/supplierCategoryController');
const { protect, authorize } = require('../middleware/auth');

// Supplier Categories - automatically filtered to type='supplier'
router
    .route('/')
    .get(protect, getSupplierCategories)
    .post(protect, authorize('admin', 'manager', 'accounts'), createSupplierCategory);

router
    .route('/:id')
    .get(protect, getSupplierCategory)
    .put(protect, authorize('admin', 'manager', 'accounts'), updateSupplierCategory)
    .delete(protect, authorize('admin', 'manager', 'accounts'), deleteSupplierCategory);

module.exports = router;
