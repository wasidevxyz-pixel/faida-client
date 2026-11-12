const express = require('express');
const router = express.Router();
const {
    getClearances,
    createClearance,
    deleteClearance
} = require('../controllers/employeeClearanceController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(authorize('admin', 'manager', 'accounts', 'emp_clearance'), getClearances)
    .post(authorize('admin', 'manager', 'accounts', 'emp_clearance'), createClearance);

router.route('/:id')
    .delete(authorize('admin', 'manager'), deleteClearance);

module.exports = router;
