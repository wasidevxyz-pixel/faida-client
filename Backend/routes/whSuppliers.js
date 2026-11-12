const express = require('express');
const router = express.Router();
const {
    getWHSuppliers,
    getWHSupplier,
    createWHSupplier,
    updateWHSupplier,
    deleteWHSupplier,
    getNextCode
} = require('../controllers/whSupplierController');

const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/next-code', getNextCode);

router.route('/')
    .get(getWHSuppliers)
    .post(createWHSupplier);

router.route('/:id')
    .get(getWHSupplier)
    .put(updateWHSupplier)
    .delete(deleteWHSupplier);

module.exports = router;
