const express = require('express');
const router = express.Router();
const {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment
} = require('../controllers/departmentController');

const { protect, authorize } = require('../middleware/auth');
const stableCache = require('../middleware/stableCache');

router.route('/')
    .get(protect, stableCache, getDepartments)
    .post(protect, authorize('admin', 'manager'), createDepartment);

router.route('/:id')
    .get(protect, stableCache, getDepartment)
    .put(protect, authorize('admin', 'manager'), updateDepartment)
    .delete(protect, authorize('admin'), deleteDepartment);

module.exports = router;
