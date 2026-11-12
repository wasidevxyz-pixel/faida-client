const express = require('express');
const router = express.Router();
const {
    getClosingSheet,
    saveClosingSheet,
    getIncomeStatementData,
    saveIncomeStatement,
    getClosingSheetsReport,
    getDepartmentWiseReport,
    getDepartmentDetails,
    getDateWiseSaleReport
} = require('../controllers/closingSheetController');

const { protect } = require('../middleware/auth');

router.route('/income-statement')
    .get(protect, getIncomeStatementData)
    .post(protect, saveIncomeStatement);

router.route('/report')
    .get(protect, getClosingSheetsReport);

router.route('/department-wise-report')
    .get(protect, getDepartmentWiseReport);

router.route('/department-details')
    .get(protect, getDepartmentDetails);

router.route('/date-wise-sale-report')
    .get(protect, getDateWiseSaleReport);

router.route('/')
    .get(protect, getClosingSheet)
    .post(protect, saveClosingSheet);


module.exports = router;


