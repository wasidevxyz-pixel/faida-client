const express = require('express');
const {
    getHRDashboardSummary,
    getBranchSalaryStats,
    getAdvanceSummary,
    getSalaryList,
    getSalaryDetail,
    getOvertimeShorttime,
    getIncrements,
    getHoursTracking,
    getEmployeePerformance,
    getEmployeeMonthlyAttendance,
    getEmployeeAdvanceLedger,
    getBranches
} = require('../controllers/hrDashboardController');

const router = express.Router();

const { protect } = require('../middleware/auth');
const stableCache = require('../middleware/stableCache');

router.use(protect);

router.get('/summary', getHRDashboardSummary);
router.get('/branch-salary', getBranchSalaryStats);
router.get('/advance-summary', getAdvanceSummary);
router.get('/salary-list', getSalaryList);
router.get('/salary-detail', getSalaryDetail);
router.get('/ot-st', getOvertimeShorttime);
router.get('/increments', getIncrements);
router.get('/hours-tracking', getHoursTracking);
router.get('/performance', getEmployeePerformance);
router.get('/employee-monthly', getEmployeeMonthlyAttendance);
router.get('/advance-ledger', getEmployeeAdvanceLedger);
router.get('/branches', stableCache, getBranches);

module.exports = router;
