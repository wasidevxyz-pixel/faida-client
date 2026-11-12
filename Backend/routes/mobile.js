const express = require('express');
const router = express.Router();
const {
  login,
  getMyLogs,
  getAdminSummary,
  getSchedule,
  getHolidays,
  getBranches,
  protectMobile,
  getBranchesList,
  getBranchEmployeesStatus,
  getEmployeeDetailedReport,
  getEmployeesDirectory,
  markEmployeeLeave,
  getEmployeeFinancials,
  getSalesDashboard
} = require('../controllers/mobileController');
const { getEmployeeAdvanceLedger } = require('../controllers/hrDashboardController');

// Public route
router.post('/auth/login', login);

// Protected routes (Requires mobile authorization token)
router.get('/attendance/my-logs', protectMobile, getMyLogs);
router.get('/attendance/admin-summary', protectMobile, getAdminSummary);
router.get('/schedule', protectMobile, getSchedule);
router.get('/holidays', protectMobile, getHolidays);
router.get('/branches', protectMobile, getBranches);
router.get('/employee/financials', protectMobile, getEmployeeFinancials);
router.get('/employee/advance-ledger', protectMobile, getEmployeeAdvanceLedger); // Same API as web app

// Admin-only reports endpoints
router.get('/admin/summary', protectMobile, getAdminSummary);
router.get('/admin/branches', protectMobile, getBranchesList);
router.get('/admin/branch-status', protectMobile, getBranchEmployeesStatus);
router.get('/admin/employee-report', protectMobile, getEmployeeDetailedReport);
router.get('/admin/employees-directory', protectMobile, getEmployeesDirectory);
router.get('/admin/sales-dashboard', protectMobile, getSalesDashboard);
router.post('/admin/mark-leave', protectMobile, markEmployeeLeave);

module.exports = router;
