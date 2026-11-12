const express = require('express');
const router = express.Router();
const {
    createWHSale,
    getWHSales,
    getWHSale,
    updateWHSale,
    deleteWHSale,
    getNextInvoiceNumber
} = require('../controllers/whSaleController');
const { protect } = require('../middleware/auth');

router.get('/next-number', protect, getNextInvoiceNumber);

router.route('/')
    .post(protect, createWHSale)
    .get(protect, getWHSales);

router.route('/:id')
    .get(protect, getWHSale)
    .put(protect, updateWHSale)
    .delete(protect, deleteWHSale);

module.exports = router;
