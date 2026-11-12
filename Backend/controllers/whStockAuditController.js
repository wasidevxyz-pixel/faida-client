const WHStockAudit = require('../models/WHStockAudit');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');

// @desc    Get all stock audits
// @route   GET /api/v1/wh-stock-audits
// @access  Private
exports.getStockAudits = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        let query = {};
        if (req.query.status) query.status = req.query.status;

        if (req.query.startDate || req.query.endDate) {
            query.date = {};
            if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
            if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
        }

        const total = await WHStockAudit.countDocuments(query);
        const audits = await WHStockAudit.find(query)
            .populate({
                path: 'items.item',
                select: 'name barcode itemsCode costPrice salePrice category company itemClass',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'company', select: 'name' }
                ]
            })
            .populate('createdBy', 'name')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: audits,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single stock audit
// @route   GET /api/v1/wh-stock-audits/:id
// @access  Private
exports.getStockAudit = async (req, res, next) => {
    try {
        const audit = await WHStockAudit.findById(req.params.id)
            .populate({
                path: 'items.item',
                populate: [
                    { path: 'itemClass' },
                    { path: 'company' }
                ]
            })
            .populate('createdBy', 'name');

        if (!audit) {
            return res.status(404).json({ success: false, message: 'Stock audit not found' });
        }

        res.status(200).json({ success: true, data: audit });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create new stock audit
// @route   POST /api/v1/wh-stock-audits
// @access  Private
exports.createStockAudit = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        req.body.createdBy = req.user.id;
        const audit = await WHStockAudit.create(req.body);

        res.status(201).json({ success: true, data: audit });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update stock audit
// @route   PUT /api/v1/wh-stock-audits/:id
// @access  Private
exports.updateStockAudit = async (req, res, next) => {
    try {
        let audit = await WHStockAudit.findById(req.params.id);

        if (!audit) {
            return res.status(404).json({ success: false, message: 'Stock audit not found' });
        }

        const existingStatus = audit.status;
        const oldItems = JSON.parse(JSON.stringify(audit.items)); // Deep copy old items

        // Update fields
        if (req.body.items) audit.items = req.body.items;
        if (req.body.date) audit.date = req.body.date;
        if (req.body.remarks) audit.remarks = req.body.remarks;

        await audit.save();

        // If it was already posted, we need to update the stock to match the NEW audit
        if (existingStatus === 'posted') {
            console.log(`Updating stock for Modified Posted Audit: ${audit.auditNo}`);

            // 1. Reverse OLD impact
            for (const oldLine of oldItems) {
                const whItem = await WHItem.findById(oldLine.item);
                if (whItem) {
                    const currentQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const oldDiff = (oldLine.physicalQty || 0) - (oldLine.systemQty || 0);
                    const reversedQty = currentQty - oldDiff;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = reversedQty;
                    } else {
                        whItem.stock = [{ quantity: reversedQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: audit.date,
                        type: (-oldDiff) > 0 ? 'in' : 'out',
                        qty: Math.abs(oldDiff),
                        previousQty: currentQty,
                        newQty: reversedQty,
                        refType: 'audit',
                        refId: audit._id,
                        remarks: `REVERSED (Update) Audit #${audit.auditNo}`,
                        createdBy: req.user ? req.user.id : null
                    });
                }
            }

            // 2. Apply NEW impact
            for (const newLine of audit.items) {
                const whItem = await WHItem.findById(newLine.item);
                if (whItem) {
                    const currentQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const newDiff = (newLine.physicalQty || 0) - (newLine.systemQty || 0);
                    const finalQty = currentQty + newDiff;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = finalQty;
                    } else {
                        whItem.stock = [{ quantity: finalQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: audit.date,
                        type: newDiff > 0 ? 'in' : 'out',
                        qty: Math.abs(newDiff),
                        previousQty: currentQty,
                        newQty: finalQty,
                        refType: 'audit',
                        refId: audit._id,
                        remarks: `Updated Audit #${audit.auditNo}`,
                        createdBy: req.user ? req.user.id : null
                    });
                }
            }
        }

        res.status(200).json({ success: true, data: audit });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete stock audit
// @route   DELETE /api/v1/wh-stock-audits/:id
// @access  Private
exports.deleteStockAudit = async (req, res, next) => {
    try {
        const audit = await WHStockAudit.findById(req.params.id);

        if (!audit) {
            return res.status(404).json({ success: false, message: 'Stock audit not found' });
        }

        // If posted, reverse the stock changes
        if (audit.status === 'posted') {
            console.log(`Reversing stock for deleted Audit: ${audit.auditNo}`);
            for (const auditItem of audit.items) {
                try {
                    const whItem = await WHItem.findById(auditItem.item);
                    if (whItem) {
                        const currentQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        // The adjustment that was made during post: diff = physicalQty - systemQty (at that time)
                        // To reverse it, we subtract that same diff from current stock.
                        const diff = (auditItem.physicalQty || 0) - (auditItem.systemQty || 0);
                        const newQty = currentQty - diff;

                        console.log(`Reversing Item: ${whItem.name} | Current: ${currentQty} | Diff: ${diff} | New: ${newQty}`);

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }

                        whItem.markModified('stock');
                        await whItem.save();

                        // Create Reversal Log
                        await WHStockLog.create({
                            item: whItem._id,
                            date: audit.date,
                            type: (-diff) > 0 ? 'in' : 'out', // Negative of adjustment
                            qty: Math.abs(diff),
                            previousQty: currentQty,
                            newQty: newQty,
                            refType: 'audit',
                            refId: audit._id,
                            remarks: `DELETED: Stock Audit #${audit.auditNo} (REVERSED)`,
                            createdBy: req.user ? req.user.id : null
                        });
                    }
                } catch (err) {
                    console.error(`Error reversing stock for item ${auditItem.item} on delete:`, err.message);
                }
            }
        }

        await audit.deleteOne();
        res.status(200).json({ success: true, message: 'Audit deleted and stock reversed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Post stock audit (Update actual stock)
// @route   POST /api/v1/wh-stock-audits/:id/post
// @access  Private
exports.postStockAudit = async (req, res, next) => {
    try {
        const audit = await WHStockAudit.findById(req.params.id);
        if (!audit) {
            return res.status(404).json({ success: false, message: 'Stock audit not found' });
        }

        if (audit.status === 'posted') {
            return res.status(400).json({ success: false, message: 'Audit already posted' });
        }

        // 1. Update items stock
        console.log(`Starting stock update for Audit: ${audit.auditNo}`);
        for (const auditItem of audit.items) {
            try {
                const whItem = await WHItem.findById(auditItem.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const physicalQty = auditItem.physicalQty || 0;
                    const diff = physicalQty - previousQty;

                    console.log(`Updating Item: ${whItem.name} | Prev: ${previousQty} | New: ${physicalQty} | Diff: ${diff}`);

                    // Update WHItem
                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = physicalQty;
                    } else {
                        whItem.stock = [{ quantity: physicalQty, opening: 0 }];
                    }

                    whItem.markModified('stock'); // Explicitly tell Mongoose that the stock array changed
                    await whItem.save();

                    // Create Stock Log
                    await WHStockLog.create({
                        item: whItem._id,
                        date: audit.date,
                        type: diff > 0 ? 'in' : 'out',
                        qty: Math.abs(diff),
                        previousQty: previousQty,
                        newQty: physicalQty,
                        refType: 'audit',
                        refId: audit._id,
                        remarks: `Stock Audit #${audit.auditNo}`,
                        createdBy: req.user ? req.user.id : null
                    });
                } else {
                    console.error(`Item not found for stock update: ${auditItem.item}`);
                }
            } catch (err) {
                console.error(`Error updating item ${auditItem.item}:`, err.message);
                // We should probably throw here to stop the process if critical
                throw new Error(`Failed to update stock for item ${auditItem.item}: ${err.message}`);
            }
        }

        // 2. Update audit status
        audit.status = 'posted';
        await audit.save();

        console.log(`Successfully posted Audit: ${audit.auditNo}`);

        res.status(200).json({
            success: true,
            message: 'Stock audit posted successfully',
            data: audit
        });
    } catch (error) {
        console.error('Post Stock Audit Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
