const express = require('express');
const router = express.Router();
const {
    getWHItems,
    getWHPOSItems,
    getWHItem,
    createWHItem,
    updateWHItem,
    deleteWHItem,
    getNextSeqId,
    importStock,
    getWHItemByBarcode
} = require('../controllers/whItemController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/next-seq', getNextSeqId);
router.post('/import-stock', importStock);
router.get('/barcode/:code', getWHItemByBarcode);
router.get('/pos-catalog', authorize('wh_pos_sale'), getWHPOSItems);

router.route('/')
    .get(getWHItems)
    .post(createWHItem);

router.route('/:id')
    .get(getWHItem)
    .put(updateWHItem)
    .delete(deleteWHItem);

module.exports = router;
