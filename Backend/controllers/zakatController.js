const Zakat = require('../models/Zakat');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all zakat entries
// @route   GET /api/v1/zakats
// @access  Private
const getZakats = asyncHandler(async (req, res, next) => {
    res.status(200).json(res.advancedResults);
});

// @desc    Get single zakat entry
// @route   GET /api/v1/zakats/:id
// @access  Private
const getZakat = asyncHandler(async (req, res, next) => {
    const zakat = await Zakat.findById(req.params.id)
        .populate('createdBy', 'name email');

    if (!zakat) {
        return next(new ErrorResponse(`Zakat entry not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({ success: true, data: zakat });
});

// @desc    Create new zakat entry
// @route   POST /api/v1/zakats
// @access  Private
const createZakat = asyncHandler(async (req, res, next) => {
    // Add user to req.body
    req.body.createdBy = req.user.id;

    const zakat = await Zakat.create(req.body);

    res.status(201).json({
        success: true,
        data: zakat
    });
});

// @desc    Update zakat entry
// @route   PUT /api/v1/zakats/:id
// @access  Private
const updateZakat = asyncHandler(async (req, res, next) => {
    let zakat = await Zakat.findById(req.params.id);

    if (!zakat) {
        return next(new ErrorResponse(`Zakat entry not found with id of ${req.params.id}`, 404));
    }

    zakat = await Zakat.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });

    res.status(200).json({ success: true, data: zakat });
});

// @desc    Delete zakat entry
// @route   DELETE /api/v1/zakats/:id
// @access  Private
const deleteZakat = asyncHandler(async (req, res, next) => {
    const zakat = await Zakat.findById(req.params.id);

    if (!zakat) {
        return next(new ErrorResponse(`Zakat entry not found with id of ${req.params.id}`, 404));
    }

    await Zakat.deleteOne({ _id: req.params.id });

    res.status(200).json({ success: true, data: {} });
});

// @desc    Get zakats by date range
// @route   GET /api/v1/zakats/date-range
// @access  Private
const getZakatsByDateRange = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, branch, type } = req.query;

    if (!startDate || !endDate) {
        return next(new ErrorResponse('Please provide both startDate and endDate', 400));
    }

    // Build branch filter
    const branchFilter = {};
    if (branch && branch !== 'all') {
        branchFilter.branch = branch;
    }

    // Calculate Opening Balance (all transactions BEFORE startDate)
    const openingBalanceResult = await Zakat.aggregate([
        {
            $match: {
                ...branchFilter,
                date: { $lt: new Date(startDate) }
            }
        },
        {
            $group: {
                _id: null,
                totalReceive: {
                    $sum: { $cond: [{ $eq: ['$type', 'Receive'] }, '$amount', 0] }
                },
                totalPay: {
                    $sum: { $cond: [{ $eq: ['$type', 'Pay'] }, '$amount', 0] }
                }
            }
        }
    ]);

    const openingReceive = openingBalanceResult.length > 0 ? openingBalanceResult[0].totalReceive : 0;
    const openingPay = openingBalanceResult.length > 0 ? openingBalanceResult[0].totalPay : 0;
    const openingBalance = openingReceive - openingPay;

    // Get transactions within date range
    const query = {
        ...branchFilter,
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z')
        }
    };

    if (type && type !== 'all') {
        query.type = type;
    }

    const zakats = await Zakat.find(query)
        .sort({ date: 1, createdAt: 1 }) // Sort by date ascending for proper ledger view
        .populate('createdBy', 'name');

    // Calculate totals for the date range
    let periodReceive = 0;
    let periodPay = 0;
    zakats.forEach(z => {
        if (z.type === 'Receive') {
            periodReceive += z.amount || 0;
        } else {
            periodPay += z.amount || 0;
        }
    });

    // Closing Balance = Opening Balance + Period Receive - Period Pay
    const closingBalance = openingBalance + periodReceive - periodPay;

    res.status(200).json({
        success: true,
        count: zakats.length,
        openingBalance: openingBalance,
        periodReceive: periodReceive,
        periodPay: periodPay,
        closingBalance: closingBalance,
        data: zakats
    });
});

// @desc    Get zakat summary
// @route   GET /api/v1/zakats/summary
// @access  Private
const getZakatSummary = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, branch } = req.query;

    const match = {};

    if (startDate && endDate) {
        match.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z')
        };
    }

    if (branch && branch !== 'all') {
        match.branch = branch;
    }

    const summary = await Zakat.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$type',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    const result = {
        pay: { total: 0, count: 0 },
        receive: { total: 0, count: 0 }
    };

    summary.forEach(item => {
        if (item._id === 'Pay') {
            result.pay = { total: item.totalAmount, count: item.count };
        } else if (item._id === 'Receive') {
            result.receive = { total: item.totalAmount, count: item.count };
        }
    });

    res.status(200).json({
        success: true,
        data: result
    });
});

module.exports = {
    getZakats,
    getZakat,
    createZakat,
    updateZakat,
    deleteZakat,
    getZakatsByDateRange,
    getZakatSummary
};
