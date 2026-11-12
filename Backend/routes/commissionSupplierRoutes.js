const express = require('express');
const { getSuppliers, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/commissionSupplierController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getSuppliers)
    .post(createSupplier);

router.route('/:id')
    .put(updateSupplier)
    .delete(deleteSupplier);

module.exports = router;
