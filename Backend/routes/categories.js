const express = require('express');
const router = express.Router();
const {
    getCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

router
    .route('/')
    .get(protect, getCategories)
    .post(protect, authorize('admin', 'manager'), createCategory);

router
    .route('/:id')
    .get(protect, getCategory)
    .put(protect, authorize('admin', 'manager'), updateCategory)
    .delete(protect, authorize('admin', 'manager'), deleteCategory);

module.exports = router;
