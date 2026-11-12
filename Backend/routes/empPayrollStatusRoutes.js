const express = require('express');
const router = express.Router();
const { getEmpPayrollStatus } = require('../controllers/empPayrollStatusController');
const { protect } = require('../middleware/auth');

router.get('/emp-payroll-status', protect, getEmpPayrollStatus);

module.exports = router;
