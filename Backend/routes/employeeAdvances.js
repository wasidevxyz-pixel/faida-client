const express = require('express');
const router = express.Router();
const {
    getEmployeeAdvances,
    getEmployeeAdvance,
    createEmployeeAdvance,
    updateEmployeeAdvance,
    deleteEmployeeAdvance,
    getAdvancePayRecReport,
    getEmployeeAdvanceActivityReport,
    getInstallmentPlan,
    saveInstallmentPlan
} = require('../controllers/employeeAdvanceController');

const { protect, authorize } = require('../middleware/auth');

router.get('/report', protect, getAdvancePayRecReport);
router.get('/activity-report', protect, getEmployeeAdvanceActivityReport);
router.get('/installment-plan', protect, getInstallmentPlan);
router.post('/installment-plan', protect, authorize('admin', 'manager', 'employee_advance'), saveInstallmentPlan);

router.route('/')
    .get(protect, getEmployeeAdvances)
    .post(protect, authorize('admin', 'manager', 'employee_advance'), createEmployeeAdvance);

router.route('/:id')
    .get(protect, getEmployeeAdvance)
    .put(protect, authorize('admin', 'manager', 'employee_advance'), updateEmployeeAdvance)
    .delete(protect, authorize('admin'), deleteEmployeeAdvance);

module.exports = router;
