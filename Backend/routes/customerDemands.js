const express = require('express');
const router = express.Router();
const {
    getCustomerDemands,
    getCustomerDemand,
    createCustomerDemand,
    updateCustomerDemand,
    deleteCustomerDemand
} = require('../controllers/customerDemandController');

const { protect, authorize } = require('../middleware/auth');

router.route('/')
    .get(protect, getCustomerDemands)
    .post(protect, authorize('admin', 'sales'), createCustomerDemand);

router.route('/:id')
    .get(protect, getCustomerDemand)
    .put(protect, authorize('admin', 'sales'), updateCustomerDemand)
    .delete(protect, authorize('admin', 'sales'), deleteCustomerDemand);

module.exports = router;
