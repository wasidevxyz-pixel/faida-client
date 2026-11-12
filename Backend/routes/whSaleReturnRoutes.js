const express = require('express');
const router = express.Router();
const {
    createWHSaleReturn,
    getWHSaleReturns,
    getWHSaleReturn,
    updateWHSaleReturn,
    deleteWHSaleReturn,
    getNextReturnNumber
} = require('../controllers/whSaleReturnController');
const { protect } = require('../middleware/auth');

router.get('/next-number', protect, getNextReturnNumber);

router.route('/')
    .post(protect, createWHSaleReturn)
    .get(protect, getWHSaleReturns);

router.route('/:id')
    .get(protect, getWHSaleReturn)
    .put(protect, updateWHSaleReturn)
    .delete(protect, deleteWHSaleReturn);

module.exports = router;
