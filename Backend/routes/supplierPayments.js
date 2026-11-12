const express = require('express');
const router = express.Router();
const {
    getSupplierPayments,
    getSupplierPayment,
    createSupplierPayment,
    updateSupplierPayment,
    deleteSupplierPayment
} = require('../controllers/supplierPaymentController');

const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getSupplierPayments)
    .post(createSupplierPayment);

router.route('/:id')
    .get(getSupplierPayment)
    .put(updateSupplierPayment)
    .delete(deleteSupplierPayment);

module.exports = router;
