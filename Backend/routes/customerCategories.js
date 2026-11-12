const express = require('express');
const router = express.Router();
const {
    getCustomerCategories,
    getCustomerCategory,
    createCustomerCategory,
    updateCustomerCategory,
    deleteCustomerCategory
} = require('../controllers/customerCategoryController');
const { protect, authorize } = require('../middleware/auth');

// Customer Categories - automatically filtered to type='customer'
router
    .route('/')
    .get(protect, getCustomerCategories)
    .post(protect, authorize('admin', 'manager'), createCustomerCategory);

router
    .route('/:id')
    .get(protect, getCustomerCategory)
    .put(protect, authorize('admin', 'manager'), updateCustomerCategory)
    .delete(protect, authorize('admin', 'manager'), deleteCustomerCategory);

module.exports = router;
