const express = require('express');
const router = express.Router();
const { getCashPaidReport } = require('../controllers/cashPaidSalaryReportController');
const { protect, authorize } = require('../middleware/auth');

router.get('/cash-paid', protect, getCashPaidReport);

module.exports = router;
