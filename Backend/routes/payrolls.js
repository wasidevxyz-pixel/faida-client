const express = require('express');
const router = express.Router();
const {
    getPayrolls,
    getPayroll,
    calculatePayroll,
    createPayroll,
    updatePayroll,
    deletePayroll,
    importPayroll,
    exportPayrolls,
    getPayrollReport
} = require('../controllers/payrollController');

const { protect, authorize } = require('../middleware/auth');
const { payrollValidations, handleValidationErrors } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

router.route('/')
    .get(authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'emp_payroll_list_rpt_link', 'emp_payroll_status_rpt_link', 'emp_payroll_summary_rpt_link', 'emp_salary_detail_rpt_link', 'bank_paid_salary_rpt_link', 'cash_paid_salary_rpt_link', 'categorized_branch_report_link', 'distribute_emp_commission', 'emp_commission', 'emp_clearance', 'hr_dashboard'), getPayrolls)
    .post(authorize('admin', 'manager', 'accounts', 'monthly_payroll'), payrollValidations.create, handleValidationErrors, createPayroll);

router.route('/calculate')
    .post(authorize('admin', 'manager', 'accounts', 'monthly_payroll'), calculatePayroll);

// Import / Export routes (must be BEFORE /:id to avoid conflicts)
router.route('/import')
    .post(authorize('admin', 'manager', 'accounts', 'monthly_payroll'), importPayroll);

router.route('/export')
    .get(authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'emp_payroll_list_rpt_link', 'emp_payroll_status_rpt_link', 'emp_payroll_summary_rpt_link', 'emp_salary_detail_rpt_link', 'bank_paid_salary_rpt_link', 'cash_paid_salary_rpt_link', 'categorized_branch_report_link', 'hr_dashboard'), exportPayrolls);

router.route('/report')
    .get(authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'categorized_branch_report_link'), getPayrollReport);

router.route('/:id')
    .get(authorize('admin', 'manager', 'accounts', 'monthly_payroll', 'emp_payroll_list_rpt_link', 'emp_payroll_status_rpt_link', 'emp_payroll_summary_rpt_link', 'emp_salary_detail_rpt_link', 'bank_paid_salary_rpt_link', 'cash_paid_salary_rpt_link', 'categorized_branch_report_link', 'hr_dashboard'), getPayroll)
    .put(authorize('admin', 'manager', 'accounts', 'monthly_payroll'), updatePayroll)
    .delete(authorize('admin', 'manager', 'monthly_payroll', 'mod_11'), deletePayroll);

module.exports = router;
