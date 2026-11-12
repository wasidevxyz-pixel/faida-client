const express = require('express');
const {
    getCPRs,
    createCPR,
    updateCPR,
    deleteCPR
} = require('../controllers/supplierTaxCPR');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
// router.use(authorize('admin', 'purchases')); // Allow admin/purchases roles if needed

router
    .route('/')
    .get(getCPRs)
    .post(createCPR);

router
    .route('/:id')
    .put(updateCPR)
    .delete(deleteCPR);

module.exports = router;
