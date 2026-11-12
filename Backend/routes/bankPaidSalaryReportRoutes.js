const express = require('express');
const router = express.Router();
const { getBankPaidReport, exportBankPaidReport } = require('../controllers/bankPaidSalaryReportController');

router.get('/bank-paid', getBankPaidReport);
router.get('/bank-paid-export', exportBankPaidReport);

module.exports = router;
