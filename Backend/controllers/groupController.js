const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Group = require('../models/Group');
const User = require('../models/User');

// @desc    Get all groups
// @route   GET /api/v1/groups
// @access  Private/Admin
exports.getGroups = asyncHandler(async (req, res, next) => {
    const groups = await Group.find();

    res.status(200).json({
        success: true,
        count: groups.length,
        data: groups
    });
});

// @desc    Get single group
// @route   GET /api/v1/groups/:id
// @access  Private/Admin
exports.getGroup = asyncHandler(async (req, res, next) => {
    const group = await Group.findById(req.params.id);

    if (!group) {
        return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
        success: true,
        data: group
    });
});

// @desc    Create group
// @route   POST /api/v1/groups
// @access  Private/Admin
exports.createGroup = asyncHandler(async (req, res, next) => {
    // ✓ BUGFIX: Validate and normalize rights object
    let groupData = { ...req.body };
    
    if (groupData.rights && typeof groupData.rights === 'object') {
        // Ensure rights is a plain object with boolean values
        const normalizedRights = {};
        for (const [key, value] of Object.entries(groupData.rights)) {
            normalizedRights[key] = value === true || value === 'true'; // Handle string 'true' from JSON
        }
        groupData.rights = normalizedRights;
        console.log(`[GROUP] Creating group "${groupData.name}" with ${Object.keys(normalizedRights).length} rights`);
    }
    
    const group = await Group.create(groupData);
    
    // Verify rights were saved correctly
    if (group.rights && group.rights.size) {
        console.log(`[GROUP] ✓ Group created with ${group.rights.size} rights`);
    }

    res.status(201).json({
        success: true,
        data: group
    });
});

// @desc    Update group
// @route   PUT /api/v1/groups/:id
// @access  Private/Admin
exports.updateGroup = asyncHandler(async (req, res, next) => {
    let group = await Group.findById(req.params.id);

    if (!group) {
        return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
    }

    // ✓ BUGFIX: Validate and normalize rights object during update
    let updateData = { ...req.body };
    
    if (updateData.rights && typeof updateData.rights === 'object') {
        // Ensure rights is a plain object with boolean values
        const normalizedRights = {};
        for (const [key, value] of Object.entries(updateData.rights)) {
            normalizedRights[key] = value === true || value === 'true'; // Handle string 'true' from JSON
        }
        updateData.rights = normalizedRights;
        console.log(`[GROUP] Updating group "${group.name}" with ${Object.keys(normalizedRights).length} rights`);
    }

    group = await Group.findByIdAndUpdate(req.params.id, updateData, {
        returnDocument: 'after',
        runValidators: true
    });

    // Verify rights were saved correctly
    if (group.rights && group.rights.size) {
        console.log(`[GROUP] ✓ Group updated with ${group.rights.size} rights`);
    }

    res.status(200).json({
        success: true,
        data: group
    });
});

// @desc    Delete group
// @route   DELETE /api/v1/groups/:id
// @access  Private/Admin
exports.deleteGroup = asyncHandler(async (req, res, next) => {
    const group = await Group.findById(req.params.id);

    if (!group) {
        return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
    }

    // Check if any user is assigned to this group
    const userCount = await User.countDocuments({ groupId: req.params.id });
    if (userCount > 0) {
        return next(new ErrorResponse(`Cannot delete group. ${userCount} users are assigned to it.`, 400));
    }

    await group.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});
