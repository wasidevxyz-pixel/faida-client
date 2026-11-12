const Item = require('../models/Item');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const { itemValidations, handleValidationErrors } = require('../middleware/validation');

// @desc    Get all items
// @route   GET /api/v1/items
// @access  Private
const getItems = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single item
// @route   GET /api/v1/items/:id
// @access  Private
const getItem = asyncHandler(async (req, res, next) => {
  const item = await Item.findById(req.params.id)
    .populate('company')
    .populate('class')
    .populate('subclass')
    .populate('supplier');

  if (!item) {
    return next(new ErrorResponse(`Item not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: item });
});

// @desc    Create new item
// @route   POST /api/v1/items
// @access  Private
const createItem = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  // Enforce category restrictions for non-admins
  if (req.user.role !== 'admin') {
      if (req.user.allowedItemCategories && req.user.allowedItemCategories.length > 0) {
          const Category = require('../models/Category');
          const cats = await Category.find({ _id: { $in: req.user.allowedItemCategories } }).select('name');
          const allowedNames = cats.map(c => c.name);
          if (!allowedNames.includes(req.body.category)) {
              return next(new ErrorResponse(`User is not authorized to create item in category ${req.body.category}`, 403));
          }
      } else {
          return next(new ErrorResponse(`User is not authorized to create items in any category`, 403));
      }
  }

  const item = await Item.create(req.body);

  res.status(201).json({
    success: true,
    data: item
  });
});

// Wrap async route handlers to catch duplicate key errors globally
// In the route definitions, we rely on asyncHandler, so modify error handling in middleware
// Instead, adjust the generic error response in the controller's catch block (if any)
// Since asyncHandler forwards errors, we will handle duplicate errors in a central error middleware.
// Ensure that the error middleware (not shown) returns a clear message like "Item with this barcode already exists" when err.code === 11000.


// @desc    Update item
// @route   PUT /api/v1/items/:id
// @access  Private
const updateItem = asyncHandler(async (req, res, next) => {
  let item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse(`Item not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is item owner or admin
  if (item.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this item`, 401));
  }

  // Enforce category restrictions for non-admins if they try to change the category
  if (req.body.category && req.user.role !== 'admin') {
      if (req.user.allowedItemCategories && req.user.allowedItemCategories.length > 0) {
          const Category = require('../models/Category');
          const cats = await Category.find({ _id: { $in: req.user.allowedItemCategories } }).select('name');
          const allowedNames = cats.map(c => c.name);
          if (!allowedNames.includes(req.body.category)) {
              return next(new ErrorResponse(`User is not authorized to move item to category ${req.body.category}`, 403));
          }
      } else {
          return next(new ErrorResponse(`User is not authorized to assign items to any category`, 403));
      }
  }

  item = await Item.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: item });
});

// @desc    Delete item
// @route   DELETE /api/v1/items/:id
// @access  Private
const deleteItem = asyncHandler(async (req, res, next) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse(`Item not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is item owner or admin
  if (item.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this item`, 401));
  }

  await item.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Get items by category
// @route   GET /api/v1/items/category/:category
// @access  Private
const getItemsByCategory = asyncHandler(async (req, res, next) => {
  const items = await Item.find({ category: req.params.category });

  res.status(200).json({
    success: true,
    count: items.length,
    data: items
  });
});

// @desc    Get all categories
// @route   GET /api/v1/items/categories
// @access  Private
const getCategories = asyncHandler(async (req, res, next) => {
  const categories = await Item.distinct('category');

  res.status(200).json(categories);
});

// @desc    Get low stock items
// @route   GET /api/v1/items/low-stock
// @access  Private
const getLowStockItems = asyncHandler(async (req, res, next) => {
  const items = await Item.find({ stockQty: { $lte: 10 } }); // Adjust threshold as needed

  res.status(200).json({
    success: true,
    count: items.length,
    data: items
  });
});

// @desc    Get item by barcode
// @route   GET /api/v1/items/barcode/:code
// @access  Public
const getItemByBarcode = asyncHandler(async (req, res, next) => {
  const code = req.params.code || req.query.code;

  if (!code) {
    return next(new ErrorResponse('Barcode is required', 400));
  }
  // Try exact barcode match first
  let item = await Item.findOne({ barcode: code })
    .populate('company')
    .populate('class')
    .populate('subclass')
    .populate('supplier');

  // Fallback: exact SKU match
  if (!item) {
    item = await Item.findOne({ sku: code })
      .populate('company')
      .populate('class')
      .populate('subclass')
      .populate('supplier');
  }

  // Fallback: partial search on barcode or sku
  if (!item) {
    const regex = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    item = await Item.findOne({ $or: [{ barcode: { $regex: regex } }, { sku: { $regex: regex } }] })
      .populate('company')
      .populate('class')
      .populate('subclass')
      .populate('supplier');
  }

  if (!item) {
    return next(new ErrorResponse(`Item not found for code ${code}`, 404));
  }

  res.status(200).json({ success: true, data: item });
});

// @desc    Search items by name (starts with)
// @route   GET /api/v1/items/search?q=term&limit=20
// @access  Public
const searchItems = asyncHandler(async (req, res, next) => {
  const q = req.query.q || '';
  const limit = parseInt(req.query.limit, 10) || 20;

  if (!q) {
    return res.status(200).json({ success: true, count: 0, data: [] });
  }

  // Escape regex special chars
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match substring anywhere in name, sku, or barcode (case-insensitive)
  const regex = new RegExp(esc, 'i');

  const items = await Item.find({
    $or: [
      { name: { $regex: regex } },
      { sku: { $regex: regex } },
      { barcode: { $regex: regex } }
    ]
  })
    .limit(limit)
    .select('name sku barcode stockQty purchasePrice salePrice')
    .lean();

  res.status(200).json({ success: true, count: items.length, data: items });
});

module.exports = {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsByCategory,
  getCategories,
  getLowStockItems
  , getItemByBarcode
  , searchItems
};
