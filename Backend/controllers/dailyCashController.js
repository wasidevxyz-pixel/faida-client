const DailyCash = require('../models/DailyCash');
const Store = require('../models/Store');

// @desc    Get daily cash records
// @route   GET /api/v1/daily-cash
// @access  Private
exports.getDailyCash = async (req, res) => {
    try {
        let query = {};
        if (req.query.startDate && req.query.endDate) {
            const start = new Date(req.query.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.endDate);
            end.setHours(23, 59, 59, 999);
            
            if (req.query.dateFilterType === 'clearance') {
                query.isVerified = true;
                query.clearedAt = { $gte: start, $lte: end };
            } else if (req.query.dateFilterType === 'batch_transfer') {
                query.isVerified = true;
                query.verifiedDate = { $gte: start, $lte: end };
            } else {
                query.date = { $gte: start, $lte: end };
            }
        } else if (req.query.date) {
            const start = new Date(req.query.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.date);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        }

        if (req.query.branch) {
            const branchInput = req.query.branch;
            // Robust Branch Filter: Match Name OR ID
            let branchIds = [branchInput]; // Start with the input itself

            // Try to resolve other forms (Name -> ID or ID -> Name)
            // Assuming input is Name usually
            const store = await Store.findOne({
                $or: [{ name: branchInput }, { _id: branchInput && branchInput.match(/^[0-9a-fA-F]{24}$/) ? branchInput : null }]
            });

            if (store) {
                branchIds = [store.name, store._id.toString()];
            }

         //   console.log(`DEBUG: DailyCash Branch Filter. Input: '${branchInput}', Resolved:`, branchIds);
            query.$or = branchIds.map(b => ({ branch: b }));
        }

        // Apply branch-level restriction to respect user access permissions
        const { applyBranchFilter } = require('../middleware/auth');
        query = await applyBranchFilter(req, query, DailyCash);

        if (req.query.mode) {
            query.mode = req.query.mode;
        }

        if (req.query.isDeduction !== undefined) {
            query.isDeduction = req.query.isDeduction === 'true';
        }

        if (req.query.hasBank === 'true') {
            query.bank = { $exists: true, $ne: null };
        }

        let limit = parseInt(req.query.limit);
        if (isNaN(limit)) {
            limit = 1000; // Default page size
        }
        // FIX: If limit is 0, return ALL records (same behaviour as bank-transactions API)
        if (limit === 0) {
            limit = 10000000;
        }
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * (limit === 10000000 ? 0 : limit);

        const [records, total] = await Promise.all([
            DailyCash.find(query)
                .populate('department', 'name')
                .populate('bank', 'bankName')
                .sort({ date: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            DailyCash.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: records.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            data: records
        });
    } catch (err) {
        console.error('DIAGNOSTIC ERROR in getDailyCash:', err);
        res.status(501).json({ success: false, message: err.message });
    }
};

// @desc    Create daily cash record
// @route   POST /api/v1/daily-cash
// @access  Private
exports.createDailyCash = async (req, res) => {
    try {
        const { date, department, mode } = req.body;

        if (mode === 'Cash') {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            const existing = await DailyCash.findOne({
                department,
                mode: 'Cash',
                date: { $gte: start, $lte: end }
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A Cash entry already exists for this department on ${start.toLocaleDateString()}. Only one Cash entry is allowed per day.`
                });
            }
        }

        const dailyCash = await DailyCash.create(req.body);
        res.status(201).json({ success: true, data: dailyCash });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update daily cash record
// @route   PUT /api/v1/daily-cash/:id
// @access  Private
exports.updateDailyCash = async (req, res) => {
    try {
        const { date, department, mode } = req.body;

        // If updating to Cash or changing date/dept of a Cash entry, check for duplicates
        const record = await DailyCash.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

        const newMode = mode || record.mode;
        const newDate = date || record.date;
        const newDept = department || record.department;

        if (newMode === 'Cash') {
            const start = new Date(newDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(newDate);
            end.setHours(23, 59, 59, 999);

            const existing = await DailyCash.findOne({
                _id: { $ne: req.params.id }, // Exclude current record
                department: newDept,
                mode: 'Cash',
                date: { $gte: start, $lte: end }
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A Cash entry already exists for this department on ${start.toLocaleDateString()}.`
                });
            }
        }

        const dailyCash = await DailyCash.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        res.status(200).json({ success: true, data: dailyCash });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete daily cash record
// @route   DELETE /api/v1/daily-cash/:id
// @access  Private
exports.deleteDailyCash = async (req, res) => {
    try {
        const dailyCash = await DailyCash.findById(req.params.id);
        if (!dailyCash) return res.status(404).json({ success: false, message: 'Record not found' });
        await dailyCash.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.error('ERROR in deleteDailyCash:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Bulk Verify Daily Cash Records
// @route   PUT /api/v1/daily-cash/verify
// @access  Private
exports.verifyDailyCash = async (req, res) => {
    try {
        const { updates } = req.body; // Array of { id, isVerified }

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: 'Invalid updates payload' });
        }

        const bulkOps = updates.map(update => {
            const setObj = {
                isVerified: update.isVerified,
                ...(update.verifiedDate && { verifiedDate: update.verifiedDate })
            };
            
            // Set clearedAt to system date when being verified, or unset it when unverified
            if (update.isVerified) {
                setObj.clearedAt = new Date();
            }

            return {
                updateOne: {
                    filter: { _id: update.id },
                    update: {
                        $set: setObj,
                        ...(!update.isVerified && { $unset: { clearedAt: 1 } })
                    }
                }
            };
        });

        if (bulkOps.length > 0) {
            await DailyCash.bulkWrite(bulkOps);
        }

        res.status(200).json({ success: true, message: 'Records updated successfully' });
    } catch (err) {
        console.error('ERROR in verifyDailyCash:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
