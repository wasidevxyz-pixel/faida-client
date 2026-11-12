const express = require('express');
const router = express.Router();
const {
    getWHCustomerPayments,
    getWHCustomerPayment,
    createWHCustomerPayment,
    updateWHCustomerPayment,
    deleteWHCustomerPayment
} = require('../controllers/whCustomerPaymentController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getWHCustomerPayments)
    .post(createWHCustomerPayment);

router.route('/:id')
    .get(getWHCustomerPayment)
    .put(updateWHCustomerPayment)
    .delete(deleteWHCustomerPayment);

module.exports = router;
