const express = require('express');
const router = express.Router();
const { getWHLedgerReport, getWHCustomerBalances, getWHStockPosition, getWHItemLedger, getWHStockActivity, adjustWHItemStock } = require('../controllers/whLedgerController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/report', getWHLedgerReport);
router.get('/balances', getWHCustomerBalances);
router.get('/stock-position', getWHStockPosition);
router.get('/item-ledger', getWHItemLedger);
router.post('/item-ledger/adjust', authorize('admin', 'wh_stock_audit'), adjustWHItemStock);
router.get('/stock-activity', getWHStockActivity);

module.exports = router;
