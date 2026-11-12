const express = require('express');
const router = express.Router();
const {
    getExemptionInvoices,
    createExemptionInvoice,
    updateExemptionInvoice,
    deleteExemptionInvoice,
    deleteExemptionInvoiceEntry
} = require('../controllers/exemptionInvoiceController');

const { protect } = require('../middleware/auth');

router.use(protect);

router
    .route('/')
    .get(getExemptionInvoices)
    .post(createExemptionInvoice);

router
    .route('/:id')
    .put(updateExemptionInvoice)
    .delete(deleteExemptionInvoice);

router.delete('/:id/entries/:entryId', deleteExemptionInvoiceEntry);

module.exports = router;
