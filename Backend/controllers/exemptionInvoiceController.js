const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const ExemptionInvoice = require('../models/ExemptionInvoice');

// @desc    Get all exemption invoice records (with filters)
// @route   GET /api/v1/exemption-invoices
// @access  Private
exports.getExemptionInvoices = asyncHandler(async (req, res, next) => {
    let query = {};

    if (req.query.branch) {
        query.branch = req.query.branch;
    }

    if (req.query.startDate && req.query.endDate) {
        const start = new Date(req.query.startDate);
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        query.date = { $gte: start, $lte: end };
    } else if (req.query.date) {
        const d = new Date(req.query.date);
        const nextDay = new Date(d);
        nextDay.setDate(d.getDate() + 1);
        query.date = { $gte: d, $lt: nextDay };
    }

    const data = await ExemptionInvoice.find(query)
        .populate('branch')
        .populate({
            path: 'entries.supplier',
            populate: {
                path: 'category',
                select: 'name'
            }
        })
        .sort({ date: -1 });

    res.status(200).json({
        success: true,
        count: data.length,
        data: data
    });
});

// @desc    Create exemption invoice record
// @route   POST /api/v1/exemption-invoices
// @access  Private
exports.createExemptionInvoice = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;
    const exemptionRecord = await ExemptionInvoice.create(req.body);

    res.status(201).json({
        success: true,
        data: exemptionRecord
    });
});

// @desc    Update exemption invoice record
// @route   PUT /api/v1/exemption-invoices/:id
// @access  Private
exports.updateExemptionInvoice = asyncHandler(async (req, res, next) => {
    let exemption = await ExemptionInvoice.findById(req.params.id);
    if (!exemption) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }

    exemption = await ExemptionInvoice.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });

    res.status(200).json({ success: true, data: exemption });
});

// @desc    Delete exemption invoice record
// @route   DELETE /api/v1/exemption-invoices/:id
// @access  Private
exports.deleteExemptionInvoice = asyncHandler(async (req, res, next) => {
    const exemption = await ExemptionInvoice.findById(req.params.id);
    if (!exemption) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }
    await exemption.deleteOne();
    res.status(200).json({ success: true, data: {} });
});

// @desc    Delete single entry from exemption invoice record
// @route   DELETE /api/v1/exemption-invoices/:id/entries/:entryId
// @access  Private
exports.deleteExemptionInvoiceEntry = asyncHandler(async (req, res, next) => {
    let exemption = await ExemptionInvoice.findById(req.params.id);
    if (!exemption) {
        return next(new ErrorResponse(`No record found with id of ${req.params.id}`, 404));
    }

    const entryCountBefore = exemption.entries.length;
    exemption.entries = exemption.entries.filter(entry => entry._id.toString() !== req.params.entryId);

    if (exemption.entries.length === entryCountBefore) {
        return next(new ErrorResponse(`No entry found with id of ${req.params.entryId}`, 404));
    }

    // Recalculate totals
    exemption.totalAmount = exemption.entries.reduce((acc, r) => acc + (r.invoiceAmount || 0), 0);

    if (exemption.entries.length === 0) {
        await exemption.deleteOne();
        return res.status(200).json({ success: true, data: {}, message: 'Sheet deleted as it became empty' });
    }

    await exemption.save();

    res.status(200).json({ success: true, data: exemption });
});
