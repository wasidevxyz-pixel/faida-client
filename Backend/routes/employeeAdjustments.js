const express = require('express');
const router = express.Router();
const {
    getAdjustments,
    createAdjustment,
    deleteAdjustment
} = require('../controllers/employeeAdjustmentController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(authorize('admin', 'manager', 'accounts', 'emp_adjustment'), getAdjustments)
    .post(authorize('admin', 'manager', 'accounts', 'emp_adjustment'), createAdjustment);

router.route('/:id')
    .delete(authorize('admin', 'manager'), deleteAdjustment);

module.exports = router;
