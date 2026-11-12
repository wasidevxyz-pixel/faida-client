const express = require('express');
const router = express.Router();
const SystemLog = require('../models/SystemLog');
const { protect, authorize } = require('../middleware/auth');
const aiDiagnosticsController = require('../controllers/aiDiagnosticsController');

// All routes here should be protected and only for admins/specific permissions
router.use(protect);
router.use(authorize('system_logs'));

/**
 * @route   GET /api/v1/system-logs
 * @desc    Get all system logs with filtering and pagination
 */
router.get('/', async (req, res) => {
    try {
        const { level, type, startDate, endDate, search, page = 1, limit = 50 } = req.query;

        const query = {};

        if (level) query.level = level;
        if (type) query.type = type;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$get = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { message: { $regex: search, $options: 'i' } },
                { 'meta.url': { $regex: search, $options: 'i' } },
                { 'meta.userName': { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await SystemLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('meta.userId', 'name email role');

        const total = await SystemLog.countDocuments(query);

        res.status(200).json({
            success: true,
            count: logs.length,
            total,
            pages: Math.ceil(total / limit),
            data: logs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @route   GET /api/v1/system-logs/stats
 * @desc    Get log statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await SystemLog.aggregate([
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 }
                }
            }
        ]);

        const typeStats = await SystemLog.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                levels: stats,
                types: typeStats
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @route   DELETE /api/v1/system-logs
 * @desc    Clear logs (danger zone)
 */
router.delete('/', async (req, res) => {
    try {
        const { olderThanDays } = req.query;

        let query = {};
        if (olderThanDays) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(olderThanDays));
            query.timestamp = { $lt: date };
        }

        const result = await SystemLog.deleteMany(query);

        await SystemLog.log('warn', `Logs cleared by ${req.user.name}. Count: ${result.deletedCount}`, 'security', {
            userId: req.user.id,
            ip: req.ip
        });

        res.status(200).json({
            success: true,
            message: `Deleted ${result.deletedCount} logs`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @route   GET /api/v1/system-logs/:id/diagnose
 * @desc    Get AI-driven diagnostic for a specific log
 */
router.get('/:id/diagnose', aiDiagnosticsController.diagnoseLog);

module.exports = router;
