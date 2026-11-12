const express = require('express');
const {
    createWHPurchase,
    getWHPurchases,
    getWHPurchase,
    updateWHPurchase,
    deleteWHPurchase,
    getNextInvoiceNumber
} = require('../controllers/whPurchaseController');

const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/next-number', getNextInvoiceNumber);

router.route('/')
    .get(getWHPurchases)
    .post(createWHPurchase);

router.route('/:id')
    .get(getWHPurchase)
    .put(updateWHPurchase)
    .delete(deleteWHPurchase);

module.exports = router;
