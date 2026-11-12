const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createWHPurchaseReturn,
    getWHPurchaseReturns,
    getWHPurchaseReturnById,
    updateWHPurchaseReturn,
    deleteWHPurchaseReturn,
    getNextReturnNumber
} = require('../controllers/whPurchaseReturnController');

// All routes require authentication
router.use(protect);

router.get('/next-number', getNextReturnNumber);

// Routes
router.route('/')
    .get(getWHPurchaseReturns)
    .post(createWHPurchaseReturn);

router.route('/:id')
    .get(getWHPurchaseReturnById)
    .put(updateWHPurchaseReturn)
    .delete(deleteWHPurchaseReturn);

module.exports = router;
