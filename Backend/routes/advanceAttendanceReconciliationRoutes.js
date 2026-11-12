const express = require('express');
const router = express.Router();
const {
    getReconciliation,
    saveReconciliation,
    syncToEmployeeAdjustment,
    clearReconciliation
} = require('../controllers/advanceAttendanceReconciliationController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getReconciliation);

router.route('/save')
    .post(authorize('admin', 'manager', 'attendance'), saveReconciliation);

router.route('/clear')
    .post(authorize('admin', 'manager', 'attendance'), clearReconciliation);

router.route('/sync-adjustments')
    .post(authorize('admin', 'manager', 'attendance'), syncToEmployeeAdjustment);

module.exports = router;
