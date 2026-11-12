const express = require('express');
const router = express.Router();
const {
    createWHSale,
    getWHSales,
    getWHSale,
    updateWHSale,
    deleteWHSale,
    getNextInvoiceNumber,
    createWHPOSSale,
    getWHPOSSales,
    getWHPOSReturns,
    getWHPOSReturnInvoice,
    createWHPOSReturn,
    getWHPOSReturnQueue,
    reviewWHPOSReturn
} = require('../controllers/whSaleController');
const { protect, authorize } = require('../middleware/auth');

router.get('/next-number', protect, getNextInvoiceNumber);

router.route('/')
    .post(protect, createWHSale)
    .get(protect, getWHSales);

router.get('/pos/list', protect, authorize('wh_pos_sale'), getWHPOSSales);
router.get('/pos/returns', protect, authorize('wh_pos_sale', 'wh_sale_return'), getWHPOSReturns);
router.post('/pos', protect, authorize('wh_pos_sale'), createWHPOSSale);
router.get('/pos-return/invoice/:invoiceNo', protect, authorize('wh_pos_sale'), getWHPOSReturnInvoice);
router.post('/pos-return', protect, authorize('wh_pos_sale'), createWHPOSReturn);
router.get('/pos-return-queue', protect, authorize('wh_pos_return_approve'), getWHPOSReturnQueue);
router.post('/pos-return-queue/:id/:action', protect, authorize('wh_pos_return_approve'), reviewWHPOSReturn);

router.route('/:id')
    .get(protect, getWHSale)
    .put(protect, updateWHSale)
    .delete(protect, deleteWHSale);

module.exports = router;
