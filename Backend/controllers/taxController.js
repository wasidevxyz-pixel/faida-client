const asyncHandler = require('../middleware/async');
const Tax = require('../models/Tax');

// @desc    Get all taxes
// @route   GET /api/v1/taxes
// @access  Private
exports.getTaxes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } },
      { taxNumber: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  if (req.query.type) {
    query.type = req.query.type;
  }

  if (req.query.isActive !== undefined) {
    query.isActive = req.query.isActive === 'true';
  }

  if (req.query.isDefault !== undefined) {
    query.isDefault = req.query.isDefault === 'true';
  }

  const taxes = await Tax.find(query)
    .populate('createdBy', 'name')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Tax.countDocuments(query);

  res.status(200).json({
    success: true,
    data: taxes,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      prev: page > 1 ? { page: page - 1 } : null,
      next: page < Math.ceil(total / limit) ? { page: page + 1 } : null
    }
  });
});

// @desc    Get active taxes (for dropdowns)
// @route   GET /api/v1/taxes/active
// @access  Private
exports.getActiveTaxes = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const taxes = await Tax.getActiveTaxes(type);

  res.status(200).json({
    success: true,
    data: taxes
  });
});

// @desc    Get default tax
// @route   GET /api/v1/taxes/default
// @access  Private
exports.getDefaultTax = asyncHandler(async (req, res) => {
  const defaultTax = await Tax.getDefaultTax();

  res.status(200).json({
    success: true,
    data: defaultTax
  });
});

// @desc    Get applicable taxes for date
// @route   GET /api/v1/taxes/applicable
// @access  Private
exports.getApplicableTaxes = asyncHandler(async (req, res) => {
  const { date, type } = req.query;
  const applicableDate = date ? new Date(date) : new Date();

  const taxes = await Tax.getApplicableTaxes(applicableDate, type);

  res.status(200).json({
    success: true,
    data: taxes
  });
});

// @desc    Get single tax
// @route   GET /api/v1/taxes/:id
// @access  Private
exports.getTax = asyncHandler(async (req, res) => {
  const tax = await Tax.findById(req.params.id)
    .populate('createdBy', 'name');

  if (!tax) {
    return res.status(404).json({
      success: false,
      message: 'Tax not found'
    });
  }

  res.status(200).json({
    success: true,
    data: tax
  });
});

// @desc    Create tax
// @route   POST /api/v1/taxes
// @access  Private (admin, manager)
exports.createTax = asyncHandler(async (req, res) => {
  // Check if tax name already exists
  const existingTax = await Tax.findOne({ name: req.body.name });

  if (existingTax) {
    return res.status(400).json({
      success: false,
      message: 'Tax name already exists'
    });
  }

  const tax = new Tax({
    ...req.body,
    createdBy: req.user.id
  });

  const savedTax = await tax.save();

  const populatedTax = await Tax.findById(savedTax._id)
    .populate('createdBy', 'name');

  res.status(201).json({
    success: true,
    data: populatedTax
  });
});

// @desc    Update tax
// @route   PUT /api/v1/taxes/:id
// @access  Private (admin, manager)
exports.updateTax = asyncHandler(async (req, res) => {
  const tax = await Tax.findById(req.params.id);

  if (!tax) {
    return res.status(404).json({
      success: false,
      message: 'Tax not found'
    });
  }

  // Check if name conflicts with existing taxes
  if (req.body.name) {
    const conflictTax = await Tax.findOne({
      _id: { $ne: req.params.id },
      name: req.body.name
    });

    if (conflictTax) {
      return res.status(400).json({
        success: false,
        message: 'Tax name already exists'
      });
    }
  }

  const updatedTax = await Tax.findByIdAndUpdate(
    req.params.id,
    req.body,
    { returnDocument: 'after', runValidators: true }
  ).populate('createdBy', 'name');

  res.status(200).json({
    success: true,
    data: updatedTax
  });
});

// @desc    Delete tax
// @route   DELETE /api/v1/taxes/:id
// @access  Private (admin only)
exports.deleteTax = asyncHandler(async (req, res) => {
  const tax = await Tax.findById(req.params.id);

  if (!tax) {
    return res.status(404).json({
      success: false,
      message: 'Tax not found'
    });
  }

  // Check if tax is being used by any items
  const Item = require('../models/Item');
  const itemsUsingTax = await Item.countDocuments({ taxPercent: tax.rate });

  if (itemsUsingTax > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete tax. ${itemsUsingTax} items are using this tax rate.`
    });
  }

  await Tax.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Tax deleted successfully'
  });
});

// @desc    Toggle tax status
// @route   PATCH /api/v1/taxes/:id/toggle-status
// @access  Private (admin, manager)
exports.toggleTaxStatus = asyncHandler(async (req, res) => {
  const tax = await Tax.findById(req.params.id);

  if (!tax) {
    return res.status(404).json({
      success: false,
      message: 'Tax not found'
    });
  }

  tax.isActive = !tax.isActive;
  await tax.save();

  const populatedTax = await Tax.findById(tax._id)
    .populate('createdBy', 'name');

  res.status(200).json({
    success: true,
    data: populatedTax
  });
});

// @desc    Set default tax
// @route   PATCH /api/v1/taxes/:id/set-default
// @access  Private (admin, manager)
exports.setDefaultTax = asyncHandler(async (req, res) => {
  const tax = await Tax.findById(req.params.id);

  if (!tax) {
    return res.status(404).json({
      success: false,
      message: 'Tax not found'
    });
  }

  // Remove default from all taxes
  await Tax.updateMany(
    { _id: { $ne: req.params.id } },
    { isDefault: false }
  );

  // Set this tax as default
  tax.isDefault = true;
  await tax.save();

  const populatedTax = await Tax.findById(tax._id)
    .populate('createdBy', 'name');

  res.status(200).json({
    success: true,
    data: populatedTax
  });
});

// @desc    Calculate tax for amount
// @route   POST /api/v1/taxes/calculate
// @access  Private
exports.calculateTax = asyncHandler(async (req, res) => {
  const { amount, taxId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid amount is required'
    });
  }

  let tax;

  if (taxId) {
    tax = await Tax.findById(taxId);
    if (!tax) {
      return res.status(404).json({
        success: false,
        message: 'Tax not found'
      });
    }
  } else {
    tax = await Tax.getDefaultTax();
    if (!tax) {
      return res.status(404).json({
        success: false,
        message: 'No default tax found'
      });
    }
  }

  const taxAmount = tax.calculateTax(amount);
  const totalAmount = amount + taxAmount;

  res.status(200).json({
    success: true,
    data: {
      amount,
      tax: {
        id: tax._id,
        name: tax.name,
        rate: tax.rate
      },
      taxAmount,
      totalAmount
    }
  });
});
