const express = require('express');
const {
    getStockAudits,
    getStockAudit,
    createStockAudit,
    updateStockAudit,
    deleteStockAudit,
    postStockAudit
} = require('../controllers/whStockAuditController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
// Permissions will need to be updated in the system if 'wh_stock_audit' is a distinct permission
// For now allowing admin and wh_stock_audit
// router.use(authorize('admin', 'wh_stock_audit'));

router
    .route('/')
    .get(authorize('admin', 'wh_stock_audit', 'stock_audit_rpt_link', 'warehouse_reports'), getStockAudits)
    .post(authorize('admin', 'wh_stock_audit'), createStockAudit);

router
    .route('/:id')
    .get(authorize('admin', 'wh_stock_audit', 'stock_audit_rpt_link', 'warehouse_reports'), getStockAudit)
    .put(authorize('admin', 'wh_stock_audit'), updateStockAudit)
    .delete(authorize('admin', 'wh_stock_audit'), deleteStockAudit); // Allowing delete with main permission for simplicity as no specific delete right was added visually yet, or I can add it now.

router
    .route('/:id/post')
    .post(authorize('admin', 'wh_stock_audit'), postStockAudit);

module.exports = router;
