const express = require('express');
const router = express.Router();
const {
    getCashSales,
    createCashSale,
    updateCashSale,
    deleteCashSale,
    getCashSale
} = require('../controllers/cashSaleController');

const { protect } = require('../middleware/auth');

router.route('/')
    .get(protect, getCashSales)
    .post(protect, createCashSale);

router.route('/:id')
    .get(protect, getCashSale)
    .put(protect, updateCashSale)
    .delete(protect, deleteCashSale);

module.exports = router;
