const PendingChequeDetail = require('../models/PendingChequeDetail');
const { applyBranchFilter } = require('../middleware/auth');

// @desc    Get pending cheque details by date, type, and optional branch
// @route   GET /api/v1/pending-cheque-details
exports.getPendingChequeDetails = async (req, res) => {
    try {
        const { date, branch, type } = req.query;
        let query = {};
        
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            
            query.date = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }
        
        // Filter by type — 'cheque' or 'cash'. Each tab has its own documents.
        if (type) {
            query.type = type;
        }

        if (branch) {
            query.branch = branch;
        }

        // Apply role-based branch filtering
        query = await applyBranchFilter(req, query, PendingChequeDetail);

        const records = await PendingChequeDetail.find(query)
            .sort({ branch: 1 })
            .populate('createdBy', 'name email');

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (err) {
        console.error('[PENDING_CHQ_RPT] Error in getPendingChequeDetails:', err);
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

// @desc    Add or Update pending cheque detail (Upsert per branch + date + type)
// @route   POST /api/v1/pending-cheque-details
exports.savePendingChequeDetail = async (req, res) => {
    try {
        const {
            date,
            branch,
            pendingCheques,
            uncheckedCheques,
            uncheckedCashActivityDays,
            cashActivityDateRange,
            activeTab
        } = req.body;
        
        if (!date || !branch) {
            return res.status(400).json({
                success: false,
                error: 'Please provide Date and Branch'
            });
        }

        // Determine record type from active tab
        const recordType = activeTab === 'cash' ? 'cash' : 'cheque';

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Each tab has its own separate document — find by branch + date + type
        let record = await PendingChequeDetail.findOne({
            branch,
            type: recordType,
            date: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        if (record) {
            // Update only the fields relevant to this tab
            if (recordType === 'cash') {
                record.uncheckedCashActivityDays = uncheckedCashActivityDays || '';
                record.cashActivityDateRange = cashActivityDateRange || '';
            } else {
                record.pendingCheques = pendingCheques || '';
                record.uncheckedCheques = uncheckedCheques || '';
            }
            record.createdBy = req.user.id;
            await record.save();
        } else {
            // Create new record for this tab
            record = await PendingChequeDetail.create({
                date: new Date(date),
                branch,
                type: recordType,
                pendingCheques: recordType === 'cheque' ? (pendingCheques || '') : '',
                uncheckedCheques: recordType === 'cheque' ? (uncheckedCheques || '') : '',
                uncheckedCashActivityDays: recordType === 'cash' ? (uncheckedCashActivityDays || '') : '',
                cashActivityDateRange: recordType === 'cash' ? (cashActivityDateRange || '') : '',
                createdBy: req.user.id
            });
        }

        return res.status(200).json({
            success: true,
            data: record
        });
    } catch (err) {
        console.error('[PENDING_CHQ_RPT] Error in savePendingChequeDetail:', err);
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

// @desc    Delete a pending cheque detail
// @route   DELETE /api/v1/pending-cheque-details/:id
exports.deletePendingChequeDetail = async (req, res) => {
    try {
        const record = await PendingChequeDetail.findById(req.params.id);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'No record found'
            });
        }

        await record.deleteOne();

        return res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.error('[PENDING_CHQ_RPT] Error in deletePendingChequeDetail:', err);
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
