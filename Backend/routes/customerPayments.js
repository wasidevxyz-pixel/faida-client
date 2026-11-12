const express = require('express');
const router = express.Router();
const {
    getCustomerPayments,
    getCustomerPayment,
    createCustomerPayment,
    updateCustomerPayment,
    deleteCustomerPayment
} = require('../controllers/customerPaymentController');

const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getCustomerPayments)
    .post(createCustomerPayment);

router.route('/:id')
    .get(getCustomerPayment)
    .put(updateCustomerPayment)
    .delete(deleteCustomerPayment);

module.exports = router;
