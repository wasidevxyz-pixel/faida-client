const asyncHandler = require('../middleware/async');
const Voucher = require('../models/Voucher');
const AuditLog = require('../models/AuditLog');

// @desc    Get all vouchers
// @route   GET /api/v1/vouchers
// @access  Private
exports.getVouchers = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by type
    if (req.query.voucherType) {
        query.voucherType = req.query.voucherType;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
        query.date = {};
        if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
    }

    // Filter by branch
    if (req.query.branch && req.query.branch !== 'all') {
        query.branch = req.query.branch;
    }

    // Filter by Supplier/Category (looks in entries.account)
    if (req.query.supplier && req.query.supplier !== 'all') {
        query['entries.account'] = req.query.supplier;
    }
    if (req.query.category && req.query.category !== 'all') {
        query['entries.account'] = req.query.category;
    }

    // Search by Voucher No or Narration
    if (req.query.search) {
        query.$or = [
            { voucherNo: { $regex: req.query.search, $options: 'i' } },
            { narration: { $regex: req.query.search, $options: 'i' } },
            { 'entries.account': { $regex: req.query.search, $options: 'i' } }
        ];
    }

    const total = await Voucher.countDocuments(query);
    const vouchers = await Voucher.find(query)
        .populate('createdBy', 'name username role')
        .populate('updatedBy', 'name username role')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // Enrich vouchers with fallback metadata for display
    const enrichedVouchers = vouchers.map(v => {
        const creatorName = v.createdByName || (v.createdBy && (v.createdBy.name || v.createdBy.username)) || 'Admin';
        const clientIp = v.ipAddress || '127.0.0.1';
        const compName = v.computerName || 'Main Server';
        return {
            ...v,
            createdByName: creatorName,
            computerName: compName,
            ipAddress: clientIp
        };
    });

    res.status(200).json({
        success: true,
        data: enrichedVouchers,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Get single voucher
// @route   GET /api/v1/vouchers/:id
// @access  Private
exports.getVoucher = asyncHandler(async (req, res, next) => {
    const voucher = await Voucher.findById(req.params.id)
        .populate('createdBy', 'name username role')
        .populate('updatedBy', 'name username role');

    if (!voucher) {
        return res.status(404).json({
            success: false,
            message: 'Voucher not found'
        });
    }

    const vObj = voucher.toObject();
    vObj.createdByName = vObj.createdByName || (vObj.createdBy && (vObj.createdBy.name || vObj.createdBy.username)) || 'Admin';
    vObj.computerName = vObj.computerName || 'Main Server';
    vObj.ipAddress = vObj.ipAddress || '127.0.0.1';

    res.status(200).json({
        success: true,
        data: vObj
    });
});

// @desc    Create new voucher
// @route   POST /api/v1/vouchers
// @access  Private
exports.createVoucher = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user.id;

    // Extract Client IP
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    const cleanIp = rawIp.replace(/^::ffff:/, '');
    req.body.ipAddress = req.body.ipAddress || cleanIp;

    // Extract User Name
    req.body.createdByName = req.body.createdByName || req.user?.name || req.user?.username || 'Admin';

    // Extract Computer / Terminal Name
    const headerCompName = req.headers['x-computer-name'];
    req.body.computerName = req.body.computerName || headerCompName || 'Counter Terminal';

    // Extract Device / User-Agent Info
    req.body.deviceInfo = req.body.deviceInfo || req.headers['user-agent'] || 'Web Browser';

    const voucher = await Voucher.create(req.body);

    // Log the action to AuditLog
    await AuditLog.log({
        action: 'create',
        entity: 'voucher',
        entityId: voucher._id,
        changes: voucher,
        ipAddress: cleanIp,
        userAgent: req.headers['user-agent'],
        performedBy: req.user.id
    });

    res.status(201).json({
        success: true,
        data: voucher
    });
});

// @desc    Update voucher
// @route   PUT /api/v1/vouchers/:id
// @access  Private
exports.updateVoucher = asyncHandler(async (req, res, next) => {
    let voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
        return res.status(404).json({
            success: false,
            message: 'Voucher not found'
        });
    }

    // Update fields
    if (req.body.entries) voucher.entries = req.body.entries;
    if (req.body.date) voucher.date = req.body.date;
    if (req.body.branch) voucher.branch = req.body.branch;
    if (req.body.narration) voucher.narration = req.body.narration;
    if (req.body.voucherType) voucher.voucherType = req.body.voucherType;

    // Track updater information
    voucher.updatedBy = req.user.id;
    voucher.updatedByName = req.user?.name || req.user?.username || 'Admin';
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    voucher.updatedIpAddress = rawIp.replace(/^::ffff:/, '');
    voucher.updatedComputerName = req.body.computerName || req.headers['x-computer-name'] || 'Counter Terminal';

    await voucher.save();

    res.status(200).json({
        success: true,
        data: voucher
    });
});

// @desc    Delete voucher
// @route   DELETE /api/v1/vouchers/:id
// @access  Private
exports.deleteVoucher = asyncHandler(async (req, res, next) => {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
        return res.status(404).json({
            success: false,
            message: 'Voucher not found'
        });
    }

    await voucher.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});

// @desc    Get next voucher number
// @route   GET /api/v1/vouchers/next-number/:type
// @access  Private
exports.getNextVoucherNumber = asyncHandler(async (req, res, next) => {
    const type = req.params.type;
    const prefix = type.toUpperCase();

    // Use aggregation to find the MAXIMUM numeric value from all existing vouchers of this type.
    // This is critical because both Supplier and Category vouchers can share the same voucherType
    // (e.g. both use 'CPV' for cash payments). Sorting by _id only gives the last inserted record,
    // not necessarily the one with the highest number — leading to duplicate key errors.
    const result = await Voucher.aggregate([
        { $match: { voucherNo: { $regex: `^${prefix}-` } } },
        {
            $addFields: {
                numericPart: {
                    $toInt: {
                        $arrayElemAt: [{ $split: ['$voucherNo', '-'] }, -1]
                    }
                }
            }
        },
        { $group: { _id: null, maxNum: { $max: '$numericPart' } } }
    ]);

    let nextNum = 1;
    if (result.length > 0 && result[0].maxNum != null) {
        nextNum = result[0].maxNum + 1;
    }

    // Loop to ensure the generated number is not already taken (safety guard)
    let nextNo = `${prefix}-${String(nextNum).padStart(3, '0')}`;
    let exists = await Voucher.findOne({ voucherNo: nextNo }).select('_id');
    while (exists) {
        nextNum++;
        nextNo = `${prefix}-${String(nextNum).padStart(3, '0')}`;
        exists = await Voucher.findOne({ voucherNo: nextNo }).select('_id');
    }

    res.status(200).json({
        success: true,
        data: nextNo
    });
});
