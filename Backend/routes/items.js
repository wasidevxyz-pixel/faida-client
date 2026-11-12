const express = require('express');
const router = express.Router();
const {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsByCategory,
  getCategories,
  getLowStockItems
  ,getItemByBarcode
  ,searchItems
} = require('../controllers/itemController');
const { protect, authorize } = require('../middleware/auth');
const { itemValidations, handleValidationErrors } = require('../middleware/validation');
const advancedResults = require('../middleware/advancedResults');
const Item = require('../models/Item');

const filterAllowedItemCategories = async (req, res, next) => {
  if (req.user && req.user.role !== 'admin') {
    if (req.user.allowedItemCategories && req.user.allowedItemCategories.length > 0) {
      try {
        const Category = require('../models/Category');
        const cats = await Category.find({ _id: { $in: req.user.allowedItemCategories } }).select('name');
        const names = cats.map(c => c.name);
        if (names.length > 0) {
           req.query.category = { in: names.join(',') };
        } else {
           req.query.category = 'NON_EXISTENT_CATEGORY_FOR_RESTRICTION';
        }
      } catch(err) {
        console.error(err);
      }
    } else {
      // If not admin and no categories allowed, they can't see any items
      req.query.category = 'NON_EXISTENT_CATEGORY_FOR_RESTRICTION';
    }
  }
  next();
};

router
  .route('/')
  .get(protect, filterAllowedItemCategories, advancedResults(Item, ['company', 'class', 'subclass', 'supplier']), getItems)
  .post(protect, authorize('admin', 'manager'), itemValidations.create, handleValidationErrors, createItem);

// Specific routes MUST come before /:id route
router
  .route('/categories')
  .get(getCategories);

// Search items by name (public)
router
  .route('/search')
  .get(searchItems);

// Lookup by barcode (must come before generic /:id route)
router
  .route('/barcode/:code')
  .get(protect, getItemByBarcode);

// Lookup by barcode with query param (fallback)
router
  .route('/barcode')
  .get(protect, getItemByBarcode);

router
  .route('/category/:category')
  .get(getItemsByCategory);

router
  .route('/low-stock')
  .get(protect, getLowStockItems);

// Generic /:id route comes LAST
router
  .route('/:id')
  .get(getItem)
  .put(protect, authorize('admin', 'manager'), itemValidations.update, handleValidationErrors, updateItem)
  .delete(protect, authorize('admin', 'manager'), deleteItem);

module.exports = router;
