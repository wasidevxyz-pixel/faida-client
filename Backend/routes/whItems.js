const express = require('express');
const router = express.Router();
const {
    getWHItems,
    getWHItem,
    createWHItem,
    updateWHItem,
    deleteWHItem,
    getNextSeqId,
    importStock
} = require('../controllers/whItemController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/next-seq', getNextSeqId);
router.post('/import-stock', importStock);

router.route('/')
    .get(getWHItems)
    .post(createWHItem);

router.route('/:id')
    .get(getWHItem)
    .put(updateWHItem)
    .delete(deleteWHItem);

module.exports = router;
