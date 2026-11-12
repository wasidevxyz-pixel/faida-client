const ExpenseHead = require('../models/ExpenseHead');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all expense heads (with optional sub-heads)
// @route   GET /api/v1/expense-heads
// @access  Private
const getExpenseHeads = asyncHandler(async (req, res, next) => {
    const { parentId, type, includeSubHeads, branch } = req.query;

    let query = { isActive: true };

    // Filter by branch
    if (branch) {
        query.branch = branch;
    }

    // If parentId is specified, get sub-heads for that parent
    if (parentId === 'null' || parentId === '') {
        query.parentId = null;  // Get only main heads
    } else if (parentId) {
        query.parentId = parentId;  // Get sub-heads of specific parent
    }

    // Filter by type if specified
    if (type && type !== 'all') {
        query.$or = [
            { type: type },
            { type: 'both' }
        ];
    }

    let heads = await ExpenseHead.find(query)
        .populate('subHeads')
        .sort({ name: 1 });

    res.status(200).json({
        success: true,
        count: heads.length,
        data: heads
    });
});

// @desc    Get single expense head
// @route   GET /api/v1/expense-heads/:id
// @access  Private
const getExpenseHead = asyncHandler(async (req, res, next) => {
    const head = await ExpenseHead.findById(req.params.id)
        .populate('subHeads');

    if (!head) {
        return next(new ErrorResponse(`Expense head not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
        success: true,
        data: head
    });
});

// @desc    Create expense head
// @route   POST /api/v1/expense-heads
// @access  Private
const createExpenseHead = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;

    // Check if head with same name already exists under same parent AND branch
    const existing = await ExpenseHead.findOne({
        name: req.body.name,
        parentId: req.body.parentId || null,
        branch: req.body.branch || 'Shop'
    });

    if (existing) {
        return next(new ErrorResponse('A head with this name already exists in this branch', 400));
    }

    const head = await ExpenseHead.create(req.body);

    res.status(201).json({
        success: true,
        data: head
    });
});

// @desc    Update expense head
// @route   PUT /api/v1/expense-heads/:id
// @access  Private
const updateExpenseHead = asyncHandler(async (req, res, next) => {
    let head = await ExpenseHead.findById(req.params.id);

    if (!head) {
        return next(new ErrorResponse(`Expense head not found with id of ${req.params.id}`, 404));
    }

    // Check for duplicate name if name is being changed
    if (req.body.name && req.body.name !== head.name) {
        const existing = await ExpenseHead.findOne({
            name: req.body.name,
            parentId: head.parentId,
            branch: head.branch, // Check in same branch
            _id: { $ne: req.params.id }
        });

        if (existing) {
            return next(new ErrorResponse('A head with this name already exists', 400));
        }
    }

    head = await ExpenseHead.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });

    res.status(200).json({
        success: true,
        data: head
    });
});

// @desc    Delete expense head
// @route   DELETE /api/v1/expense-heads/:id
// @access  Private
const deleteExpenseHead = asyncHandler(async (req, res, next) => {
    const head = await ExpenseHead.findById(req.params.id);

    if (!head) {
        return next(new ErrorResponse(`Expense head not found with id of ${req.params.id}`, 404));
    }

    // Check if this head has sub-heads
    const subHeads = await ExpenseHead.find({ parentId: req.params.id });
    if (subHeads.length > 0) {
        return next(new ErrorResponse('Cannot delete head with sub-heads. Delete sub-heads first.', 400));
    }

    await ExpenseHead.deleteOne({ _id: req.params.id });

    res.status(200).json({
        success: true,
        data: {}
    });
});

// @desc    Get heads with sub-heads (hierarchical)
// @route   GET /api/v1/expense-heads/hierarchy
// @access  Private
const getHeadsHierarchy = asyncHandler(async (req, res, next) => {
    const { type, branch } = req.query;

    let query = { parentId: null, isActive: true };

    if (branch) {
        query.branch = branch;
    }

    if (type && type !== 'all') {
        query.$or = [
            { type: type },
            { type: 'both' }
        ];
    }

    const mainHeads = await ExpenseHead.find(query)
        .populate({
            path: 'subHeads',
            match: { isActive: true }
        })
        .sort({ name: 1 });

    res.status(200).json({
        success: true,
        data: mainHeads
    });
});

// @desc    Seed default heads
// @route   POST /api/v1/expense-heads/seed
// @access  Private (Admin only)
const seedDefaultHeads = asyncHandler(async (req, res, next) => {
    // Check if heads already exist
    const existingCount = await ExpenseHead.countDocuments();
    if (existingCount > 0) {
        return res.status(200).json({
            success: true,
            message: 'Heads already exist, skipping seed',
            count: existingCount
        });
    }

    const defaultHeads = [
        { name: 'Salary', type: 'both', subHeads: ['Staff Salary', 'Manager Salary', 'Bonus', 'Overtime'] },
        { name: 'Rent', type: 'both', subHeads: ['Shop Rent', 'Warehouse Rent', 'Office Rent'] },
        { name: 'Utilities', type: 'expense', subHeads: ['Electricity', 'Water', 'Gas', 'Waste Disposal'] },
        { name: 'Transportation', type: 'expense', subHeads: ['Fuel', 'Vehicle Maintenance', 'Delivery Charges', 'Courier'] },
        { name: 'Office Supplies', type: 'expense', subHeads: ['Stationery', 'Printing', 'Furniture', 'Equipment'] },
        { name: 'Maintenance', type: 'expense', subHeads: ['Building Repair', 'Equipment Repair', 'Cleaning'] },
        { name: 'Marketing', type: 'expense', subHeads: ['Advertising', 'Promotional', 'Sponsorship', 'Social Media'] },
        { name: 'Food & Beverages', type: 'expense', subHeads: ['Staff Meals', 'Tea/Coffee', 'Entertainment'] },
        { name: 'Miscellaneous', type: 'both', subHeads: ['Charity', 'Gifts', 'Tips', 'Other'] },
        { name: 'Sales Revenue', type: 'receipt', subHeads: ['Cash Sales', 'Credit Sales', 'Online Sales'] },
        { name: 'Cash Received', type: 'receipt', subHeads: ['Customer Payment', 'Advance Received', 'Deposit'] },
        { name: 'Bank Deposit', type: 'receipt', subHeads: [] },
        { name: 'Loan Received', type: 'receipt', subHeads: [] },
        { name: 'Investment', type: 'receipt', subHeads: [] },
        { name: 'Interest Received', type: 'receipt', subHeads: [] },
        { name: 'Other Income', type: 'receipt', subHeads: ['Commission', 'Rental Income', 'Service Charges'] },
        { name: 'Refund Received', type: 'receipt', subHeads: [] }
    ];

    let createdCount = 0;

    for (const headData of defaultHeads) {
        // Create main head
        const mainHead = await ExpenseHead.create({
            name: headData.name,
            type: headData.type,
            parentId: null,
            createdBy: req.user.id
        });
        createdCount++;

        // Create sub-heads
        for (const subName of headData.subHeads) {
            await ExpenseHead.create({
                name: subName,
                type: headData.type,
                parentId: mainHead._id,
                createdBy: req.user.id
            });
            createdCount++;
        }
    }

    res.status(201).json({
        success: true,
        message: 'Default heads seeded successfully',
        count: createdCount
    });
});

module.exports = {
    getExpenseHeads,
    getExpenseHead,
    createExpenseHead,
    updateExpenseHead,
    deleteExpenseHead,
    getHeadsHierarchy,
    seedDefaultHeads
};
