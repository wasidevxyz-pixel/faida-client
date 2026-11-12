const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const SupplierTax = require('../models/SupplierTax');

// @desc    Get all supplier tax records (with filters)
// @route   GET /api/v1/supplier-taxes
// @access  Private
exports.getSupplierTaxes = asyncHandler(async (req, res, next) => {
    let query = {};

    const Supplier = require('../models/Supplier');
    const Store = require('../models/Store');
    const { applyBranchFilter } = require('../middleware/auth');

    if (req.query.branch) {
        query.branch = req.query.branch;
    }

    // Apply branch level restriction
    query = await applyBranchFilter(req, query, SupplierTax);

    if (req.query.supplier) {
        query['entries.supplier'] = req.query.supplier;
    }

    if (req.query.startDate && req.query.endDate) {
        const start = new Date(req.query.startDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(req.query.endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.date = { $gte: start, $lte: end };
    } else if (req.query.date) {
        // Precise date matching or range
        const d = new Date(req.query.date);
        d.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(d);
        nextDay.setUTCDate(d.getUTCDate() + 1);
        query.date = { $gte: d, $lt: nextDay };
    }

    // Basic pagination
    const data = await SupplierTax.find(query)
        .populate('branch')
        .populate({
            path: 'entries.supplier',
            populate: {
                path: 'category',
                select: 'name'
            }
        })
        .sort({ date: 1 })
        .lean(); // Performance: Skip hydration for reports

    res.status(200).json({
        success: true,
        count: data.length,
        data: data
    });
});

// @desc    Create supplier tax record (safe upsert – prevents duplicate sheets per branch/date)
// @route   POST /api/v1/supplier-taxes
// @access  Private
exports.createSupplierTax = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;

    const { branch, date, entries = [], totalAmount, totalTaxDeducted, totalAiTaxAmount } = req.body;

    if (!branch || !date) {
        return next(new ErrorResponse('Branch and Date are required', 400));
    }

    // Normalize date to midnight UTC so we can match on calendar day
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

    // Use findOneAndUpdate with upsert for a single-trip atomic operation
    // This is much faster than findOne + findByIdAndUpdate
    const taxRecord = await SupplierTax.findOneAndUpdate(
        {
            branch,
            date: { $gte: dayStart, $lt: dayEnd }
        },
        {
            $setOnInsert: {
                branch,
                date: dayStart, // Use normalized date for consistency
                createdBy: req.user.id
            },
            $push: { entries: { $each: entries } },
            $inc: {
                totalAmount: totalAmount || 0,
                totalTaxDeducted: totalTaxDeducted || 0,
                totalAiTaxAmount: totalAiTaxAmount || 0
            }
        },
        {
            returnDocument: 'after',
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );

    res.status(200).json({
        success: true,
        data: taxRecord,
        merged: true // Treat as merged/updated in atomic op
    });
});


// @desc    Update supplier tax record
// @route   PUT /api/v1/supplier-taxes/:id
// @access  Private
exports.updateSupplierTax = asyncHandler(async (req, res, next) => {
    let tax = await SupplierTax.findById(req.params.id);
    if (!tax) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }

    tax = await SupplierTax.findByIdAndUpdate(req.params.id, { $set: req.body }, {
        returnDocument: 'after',
        runValidators: true
    });

    res.status(200).json({ success: true, data: tax });
});

// @desc    Delete supplier tax record
// @route   DELETE /api/v1/supplier-taxes/:id
// @access  Private
exports.deleteSupplierTax = asyncHandler(async (req, res, next) => {
    const tax = await SupplierTax.findById(req.params.id);
    if (!tax) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }
    await tax.deleteOne();
    res.status(200).json({ success: true, data: {} });
});
// @desc    Delete single entry from supplier tax record
// @route   DELETE /api/v1/supplier-taxes/:id/entries/:entryId
// @access  Private
exports.deleteSupplierTaxEntry = asyncHandler(async (req, res, next) => {
    let tax = await SupplierTax.findById(req.params.id);
    if (!tax) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }

    // Filter out the entry
    const entryCountBefore = tax.entries.length;
    tax.entries = tax.entries.filter(entry => entry._id.toString() !== req.params.entryId);

    if (tax.entries.length === entryCountBefore) {
        return next(new ErrorResponse(`No entry found with id of ${req.params.entryId}`, 404));
    }

    // Recalculate totals
    tax.totalAmount = tax.entries.reduce((acc, r) => acc + (r.invoiceAmount || 0), 0);
    tax.totalTaxDeducted = tax.entries.reduce((acc, r) => acc + (r.taxDeducted || 0), 0);
    tax.totalAiTaxAmount = tax.entries.reduce((acc, r) => acc + (r.aiTaxAmount || 0), 0);

    // If no entries left, delete the entire sheet?
    if (tax.entries.length === 0) {
        await tax.deleteOne();
        return res.status(200).json({ success: true, data: {}, message: 'Sheet deleted as it became empty' });
    }

    await tax.save();

    res.status(200).json({ success: true, data: tax });
});
