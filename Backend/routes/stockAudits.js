const express = require('express');
const {
    getStockAudits,
    getStockAudit,
    createStockAudit,
    updateStockAudit,
    deleteStockAudit,
    postStockAudit
} = require('../controllers/stockAuditController');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getStockAudits)
    .post(createStockAudit);

router
    .route('/:id')
    .get(getStockAudit)
    .put(updateStockAudit)
    .delete(deleteStockAudit);

router.post('/:id/post', postStockAudit);

module.exports = router;
