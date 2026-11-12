const Party = require('../models/Party');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all parties
// @route   GET /api/v1/parties
// @access  Private
const getParties = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single party
// @route   GET /api/v1/parties/:id
// @access  Private
const getParty = asyncHandler(async (req, res, next) => {
  const party = await Party.findById(req.params.id);

  if (!party) {
    return next(new ErrorResponse(`Party not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: party });
});

// @desc    Create new party
// @route   POST /api/v1/parties
// @access  Private
const createParty = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  const party = await Party.create(req.body);

  res.status(201).json({
    success: true,
    data: party
  });
});

// @desc    Update party
// @route   PUT /api/v1/parties/:id
// @access  Private
const updateParty = asyncHandler(async (req, res, next) => {
  let party = await Party.findById(req.params.id);

  if (!party) {
    return next(new ErrorResponse(`Party not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is admin or manager
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this party`, 401));
  }

  party = await Party.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: party });
});

// @desc    Delete party
// @route   DELETE /api/v1/parties/:id
// @access  Private
const deleteParty = asyncHandler(async (req, res, next) => {
  const party = await Party.findById(req.params.id);

  if (!party) {
    return next(new ErrorResponse(`Party not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is admin or manager
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this party`, 401));
  }

  try {
    // Use deleteOne() instead of deprecated remove()
    await Party.deleteOne({ _id: req.params.id });

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting party:', error);
    return next(new ErrorResponse(`Failed to delete party: ${error.message}`, 500));
  }
});

// @desc    Get parties by type
// @route   GET /api/v1/parties/type/:type
// @access  Private
const getPartiesByType = asyncHandler(async (req, res, next) => {
  const validTypes = ['customer', 'supplier', 'both'];

  if (!validTypes.includes(req.params.type)) {
    return next(new ErrorResponse(`Invalid party type. Must be one of: ${validTypes.join(', ')}`, 400));
  }

  const parties = await Party.find({ partyType: req.params.type }).limit(1000).lean();

  res.status(200).json({
    success: true,
    count: parties.length,
    data: parties
  });
});


// @desc    Get parties with outstanding balance
// @route   GET /api/v1/parties/outstanding
// @access  Private
const getPartiesWithOutstandingBalance = asyncHandler(async (req, res, next) => {
  const parties = await Party.find({
    currentBalance: { $ne: 0 },
    partyType: { $in: ['customer', 'both'] }
  }).sort({ currentBalance: -1 }).limit(1000).lean();

  res.status(200).json({
    success: true,
    count: parties.length,
    data: parties
  });
});


module.exports = {
  getParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
  getPartiesByType,
  getPartiesWithOutstandingBalance
};
