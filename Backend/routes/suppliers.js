const express = require('express');
const {
    getSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getSupplierCategories,
    createSupplierCategory
} = require('../controllers/supplierController');

const Supplier = require('../models/Supplier');

const router = express.Router();

const advancedResults = require('../middleware/advancedResults');
const { protect } = require('../middleware/auth');

router.use(protect);

router
    .route('/categories')
    .get(getSupplierCategories)
    .post(createSupplierCategory);

router
    .route('/')
    .get(advancedResults(Supplier, ['category', 'branch']), getSuppliers)
    .post(createSupplier);

router
    .route('/:id')
    .get(getSupplier)
    .put(updateSupplier)
    .delete(deleteSupplier);

module.exports = router;
