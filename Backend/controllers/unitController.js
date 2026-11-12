const asyncHandler = require('../middleware/async');
const Unit = require('../models/Unit');

// @desc    Get all units
// @route   GET /api/v1/units
// @access  Private
exports.getUnits = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { shortName: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  if (req.query.isActive !== undefined) {
    query.isActive = req.query.isActive === 'true';
  }

  const units = await Unit.find(query)
    .populate('createdBy', 'name')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Unit.countDocuments(query);

  res.status(200).json({
    success: true,
    data: units,
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

// @desc    Get active units (for dropdowns)
// @route   GET /api/v1/units/active
// @access  Private
exports.getActiveUnits = asyncHandler(async (req, res) => {
  const units = await Unit.getActiveUnits();

  res.status(200).json({
    success: true,
    data: units
  });
});

// @desc    Get single unit
// @route   GET /api/v1/units/:id
// @access  Private
exports.getUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id)
    .populate('createdBy', 'name');

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Unit not found'
    });
  }

  res.status(200).json({
    success: true,
    data: unit
  });
});

// @desc    Create unit
// @route   POST /api/v1/units
// @access  Private (admin, manager)
exports.createUnit = asyncHandler(async (req, res) => {
  // Check if unit name or short name already exists
  const existingUnit = await Unit.findOne({
    $or: [
      { name: req.body.name },
      { shortName: req.body.shortName }
    ]
  });

  if (existingUnit) {
    return res.status(400).json({
      success: false,
      message: 'Unit name or short name already exists'
    });
  }

  const unit = new Unit({
    ...req.body,
    createdBy: req.user.id
  });

  const savedUnit = await unit.save();

  const populatedUnit = await Unit.findById(savedUnit._id)
    .populate('createdBy', 'name');

  res.status(201).json({
    success: true,
    data: populatedUnit
  });
});

// @desc    Update unit
// @route   PUT /api/v1/units/:id
// @access  Private (admin, manager)
exports.updateUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Unit not found'
    });
  }

  // Check if name or short name conflicts with existing units
  if (req.body.name || req.body.shortName) {
    const conflictUnit = await Unit.findOne({
      _id: { $ne: req.params.id },
      $or: [
        { name: req.body.name },
        { shortName: req.body.shortName }
      ]
    });

    if (conflictUnit) {
      return res.status(400).json({
        success: false,
        message: 'Unit name or short name already exists'
      });
    }
  }

  const updatedUnit = await Unit.findByIdAndUpdate(
    req.params.id,
    req.body,
    { returnDocument: 'after', runValidators: true }
  ).populate('createdBy', 'name');

  res.status(200).json({
    success: true,
    data: updatedUnit
  });
});

// @desc    Delete unit
// @route   DELETE /api/v1/units/:id
// @access  Private (admin only)
exports.deleteUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Unit not found'
    });
  }

  // Check if unit is being used by any items
  const Item = require('../models/Item');
  const itemsUsingUnit = await Item.countDocuments({ unit: unit._id });

  if (itemsUsingUnit > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete unit. ${itemsUsingUnit} items are using this unit.`
    });
  }

  await Unit.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Unit deleted successfully'
  });
});

// @desc    Toggle unit status
// @route   PATCH /api/v1/units/:id/toggle-status
// @access  Private (admin, manager)
exports.toggleUnitStatus = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Unit not found'
    });
  }

  unit.isActive = !unit.isActive;
  await unit.save();

  const populatedUnit = await Unit.findById(unit._id)
    .populate('createdBy', 'name');

  res.status(200).json({
    success: true,
    data: populatedUnit
  });
});

// @desc    Get unit conversion info
// @route   GET /api/v1/units/:id/conversion
// @access  Private
exports.getUnitConversion = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Unit not found'
    });
  }

  // Get all units for conversion options
  const allUnits = await Unit.getActiveUnits();

  res.status(200).json({
    success: true,
    data: {
      currentUnit: unit,
      conversionOptions: allUnits.filter(u => u._id.toString() !== unit._id.toString())
    }
  });
});
