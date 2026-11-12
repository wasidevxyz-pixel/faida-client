const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const SupplierTaxCPR = require('../models/SupplierTaxCPR');

// @desc    Get all CPRs
// @route   GET /api/v1/supplier-tax-cprs
// @access  Private
exports.getCPRs = asyncHandler(async (req, res, next) => {
    let query = {};

    // Date range
    if (req.query.date && typeof req.query.date === 'object') {
        const dateQuery = {};
        if (req.query.date.gte) dateQuery.$gte = new Date(req.query.date.gte);
        if (req.query.date.lte) {
            const lteDate = new Date(req.query.date.lte);
            lteDate.setHours(23, 59, 59, 999);
            dateQuery.$lte = lteDate;
        }
        query.date = dateQuery;
    }

    // Branch filter
    if (req.query.branch) {
        query.branch = req.query.branch;
    }

    // Supplier filter
    if (req.query.supplier) {
        query.supplier = req.query.supplier;
    }

    const cprs = await SupplierTaxCPR.find(query)
        .populate('branch')
        .populate('supplier')
        .sort('-date');

    res.status(200).json({
        success: true,
        count: cprs.length,
        data: cprs
    });
});

// @desc    Create new CPR
// @route   POST /api/v1/supplier-tax-cprs
// @access  Private
exports.createCPR = asyncHandler(async (req, res, next) => {
    // defensive check
    if (req.body.supplier === '') req.body.supplier = null;

    // Auto-Generate Certificate Number
    let nextCertNo = 1;
    const lastCPR = await SupplierTaxCPR.findOne().sort({ createdAt: -1 });

    if (lastCPR && lastCPR.certificateNumber) {
        // Attempt to parse string to int
        const lastNum = parseInt(lastCPR.certificateNumber);
        if (!isNaN(lastNum)) {
            nextCertNo = lastNum + 1;
        } else {
            // Fallback if non-numeric found (shouldn't happen with new system)
            nextCertNo = (await SupplierTaxCPR.countDocuments()) + 1;
        }
    }

    req.body.certificateNumber = nextCertNo.toString();

    const cpr = await SupplierTaxCPR.create(req.body);

    res.status(201).json({
        success: true,
        data: cpr
    });
});

// @desc    Update CPR
// @route   PUT /api/v1/supplier-tax-cprs/:id
// @access  Private
exports.updateCPR = asyncHandler(async (req, res, next) => {
    // defensive check
    if (req.body.supplier === '') req.body.supplier = null;

    let cpr = await SupplierTaxCPR.findById(req.params.id);

    if (!cpr) {
        return next(new ErrorResponse(`CPR not found with id of ${req.params.id}`, 404));
    }

    cpr = await SupplierTaxCPR.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });

    res.status(200).json({
        success: true,
        data: cpr
    });
});

// @desc    Delete CPR
// @route   DELETE /api/v1/supplier-tax-cprs/:id
// @access  Private
exports.deleteCPR = asyncHandler(async (req, res, next) => {
    const cpr = await SupplierTaxCPR.findById(req.params.id);

    if (!cpr) {
        return next(new ErrorResponse(`CPR not found with id of ${req.params.id}`, 404));
    }

    await cpr.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});
