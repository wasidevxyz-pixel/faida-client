const express = require('express');
const router = express.Router();
const {
    getPenalties,
    createPenalty,
    updatePenalty,
    deletePenalty
} = require('../controllers/employeePenaltyController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(authorize('admin', 'manager', 'accounts', 'employee_penalty'), getPenalties)
    .post(authorize('admin', 'manager', 'employee_penalty'), createPenalty);

router.route('/:id')
    .put(authorize('admin', 'manager', 'employee_penalty'), updatePenalty)
    .delete(authorize('admin', 'manager'), deletePenalty);

module.exports = router;
