const express = require('express');
const router = express.Router();
const {
    getItemCategories,
    getItemCategory,
    createItemCategory,
    updateItemCategory,
    deleteItemCategory
} = require('../controllers/itemCategoryController');
const { protect, authorize } = require('../middleware/auth');

// Item Categories - automatically filtered to type='item'
router
    .route('/')
    .get(protect, getItemCategories)
    .post(protect, authorize('admin', 'manager'), createItemCategory);

router
    .route('/:id')
    .get(protect, getItemCategory)
    .put(protect, authorize('admin', 'manager'), updateItemCategory)
    .delete(protect, authorize('admin', 'manager'), deleteItemCategory);

module.exports = router;
