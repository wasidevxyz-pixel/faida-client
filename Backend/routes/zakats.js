const express = require('express');
const router = express.Router();
const {
    getZakats,
    getZakat,
    createZakat,
    updateZakat,
    deleteZakat,
    getZakatsByDateRange,
    getZakatSummary
} = require('../controllers/zakatController');
const { protect } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Zakat = require('../models/Zakat');

// Static routes MUST come BEFORE dynamic routes like /:id
router
    .route('/date-range')
    .get(protect, getZakatsByDateRange);

router
    .route('/summary')
    .get(protect, getZakatSummary);

// Main CRUD routes
router
    .route('/')
    .get(protect, advancedResults(Zakat, [
        { path: 'createdBy', select: 'name' }
    ]), getZakats)
    .post(protect, createZakat);

// Dynamic routes with :id AFTER static routes
router
    .route('/:id')
    .get(protect, getZakat)
    .put(protect, updateZakat)
    .delete(protect, deleteZakat);

module.exports = router;
