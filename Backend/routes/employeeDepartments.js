const express = require('express');
const router = express.Router();
const {
    getEmployeeDepartments,
    getEmployeeDepartment,
    createEmployeeDepartment,
    updateEmployeeDepartment,
    deleteEmployeeDepartment
} = require('../controllers/employeeDepartmentController');

const { protect, authorize } = require('../middleware/auth');
const stableCache = require('../middleware/stableCache');

router.route('/')
    .get(protect, stableCache, getEmployeeDepartments)
    .post(protect, authorize('admin', 'manager', 'employee_registration', 'employees'), createEmployeeDepartment);

router.route('/:id')
    .get(protect, stableCache, getEmployeeDepartment)
    .put(protect, authorize('admin', 'manager', 'employee_registration', 'employees'), updateEmployeeDepartment)
    .delete(protect, authorize('admin'), deleteEmployeeDepartment);

module.exports = router;
