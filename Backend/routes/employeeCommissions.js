const express = require('express');
const router = express.Router();
const {
    getCommissions,
    createCommission,
    deleteCommission,
    getCommissionsList,
    getCommissionById
} = require('../controllers/employeeCommissionController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/list', authorize('admin', 'manager', 'accounts', 'emp_commission', 'distribute_emp_commission', 'ug_emp_commission'), getCommissionsList);
router.get('/detail/:id', authorize('admin', 'manager', 'accounts', 'emp_commission', 'distribute_emp_commission', 'ug_emp_commission'), getCommissionById);

router.route('/')
    .get(authorize('admin', 'manager', 'accounts', 'emp_commission', 'distribute_emp_commission', 'ug_emp_commission'), getCommissions)
    .post(authorize('admin', 'manager', 'accounts', 'emp_commission', 'distribute_emp_commission', 'ug_emp_commission'), createCommission);

router.route('/:id')
    .delete(authorize('admin', 'manager'), deleteCommission);

module.exports = router;
