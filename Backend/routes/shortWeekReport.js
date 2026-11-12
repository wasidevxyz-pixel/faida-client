const express = require('express');
const router = express.Router();
const {
    getShortWeekReport,
    exportShortWeekReport
} = require('../controllers/shortWeekReportController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.route('/')
    .get(
        authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'emp_salary_reports', 'short_week_report_link'),
        getShortWeekReport
    );

router.route('/export')
    .get(
        authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'emp_salary_reports', 'short_week_report_link'),
        exportShortWeekReport
    );

module.exports = router;
