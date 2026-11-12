const express = require('express');
const router = express.Router();
const {
    getAttendance,
    getSingleAttendance,
    updateAttendance,
    bulkCreateAttendance,
    deleteAttendance,
    getTotalPresentEmployee,
    createAttendance,
    bulkUpdateAttendance,
    getBranchStatus
} = require('../controllers/attendanceController');

const { protect, authorize } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiAuth');

router.route('/branch-status')
    .get(protect, getBranchStatus);


router.route('/')
    .get(verifyApiKey, protect, getAttendance)
    .post(verifyApiKey, protect, authorize('admin', 'manager', 'attendance'), createAttendance);

router.route('/bulk')
    .post(verifyApiKey, protect, authorize('admin', 'manager', 'attendance'), bulkCreateAttendance);

router.route('/total-present')
    .get(protect, getTotalPresentEmployee);

router.route('/bulk-fix')
    .post(protect, authorize('admin', 'manager', 'attendance'), bulkUpdateAttendance);

router.route('/:id')
    .get(protect, getSingleAttendance)
    .put(protect, authorize('admin', 'manager', 'attendance'), updateAttendance)
    .delete(protect, authorize('admin'), deleteAttendance);

module.exports = router;
