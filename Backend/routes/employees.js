const express = require('express');
const router = express.Router();
const {
    getEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getNextCode,
    migrateNameUrdu,
    getEmployeesInfoReport
} = require('../controllers/employeeController');
const { getWhDedReport } = require('../controllers/whDedReportController');
const { generateIdCard }  = require('../controllers/idCardController');

const { protect, authorize } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiAuth');
const { employeeValidations, handleValidationErrors } = require('../middleware/validation');

router.get('/next-code', protect, getNextCode);
router.post('/migrate/name-urdu', protect, migrateNameUrdu);
router.get('/reports/employees-info', protect, authorize('admin', 'manager', 'employees_info_report_link'), getEmployeesInfoReport);
router.get('/reports/wh-ded-report', protect, authorize('admin', 'manager', 'wh_ded_report_link'), getWhDedReport);

// ID Card — GET /api/v1/employees/:id/id-card
router.get('/:id/id-card', protect, generateIdCard);

router.route('/')
    .get(verifyApiKey, protect, getEmployees)
    .post(protect, authorize('admin', 'manager', 'employee_registration'), employeeValidations.create, handleValidationErrors, createEmployee);

router.route('/:id')
    .get(protect, getEmployee)
    .put(protect, authorize('admin', 'manager', 'employee_registration'), employeeValidations.update, handleValidationErrors, updateEmployee)
    .delete(protect, authorize('delete_employee_reg'), deleteEmployee);

module.exports = router;
