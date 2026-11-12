const express = require('express');
const router = express.Router();
const {
    getSettlementData,
    getClearancePreview,
    clearRange,
    getSettlementHistory,
    reopenBatch,
    saveTally,
    reopenDate,
    unclearRange
} = require('../controllers/easypaisaSettlementController');

const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/data', getSettlementData);
router.get('/clearance-preview', getClearancePreview);
router.post('/clear-range', clearRange);
router.get('/history', getSettlementHistory);
router.post('/reopen-batch', reopenBatch);
router.post('/save-tally', saveTally);
router.post('/reopen-date', reopenDate);
router.post('/unclear-range', unclearRange);

module.exports = router;
