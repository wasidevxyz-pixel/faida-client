const express = require('express');
const {
    getVouchers,
    getVoucher,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    getNextVoucherNumber
} = require('../controllers/voucherController');

const router = express.Router();

const { protect, accountsAccess } = require('../middleware/auth');
const { voucherValidations, handleValidationErrors } = require('../middleware/validation');

router.use(protect);
router.use(accountsAccess);

router.get('/next-number/:type', getNextVoucherNumber);

router
    .route('/')
    .get(getVouchers)
    .post(voucherValidations.create, handleValidationErrors, createVoucher);

router
    .route('/:id')
    .get(getVoucher)
    .put(voucherValidations.update, handleValidationErrors, updateVoucher)
    .delete(deleteVoucher);

module.exports = router;
