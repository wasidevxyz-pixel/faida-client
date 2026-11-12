const express = require('express');
const router = express.Router();
const { getOvertimeShortTimeReport } = require('../controllers/overtimeReportController');
const { protect } = require('../middleware/auth');

// GET /api/v1/reports/overtime-shorttime
// Combined server-side aggregation — replaces double frontend fetch
router.get('/overtime-shorttime', protect, getOvertimeShortTimeReport);

module.exports = router;
