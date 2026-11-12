const express = require('express');
const router = express.Router();
const { 
    getFoodInvoices, 
    createFoodInvoice, 
    deleteFoodInvoice,
    getGeneratedInvoices,
    saveGeneratedInvoice,
    getNextInvoiceNumber,
    deleteGeneratedInvoice
} = require('../controllers/foodInvoices');
const { protect } = require('../middleware/auth');

router.route('/')
    .get(protect, getFoodInvoices)
    .post(protect, createFoodInvoice);

router.route('/generated')
    .get(protect, getGeneratedInvoices)
    .post(protect, saveGeneratedInvoice);

router.route('/generated/:id')
    .delete(protect, deleteGeneratedInvoice);

router.route('/next-number')
    .get(protect, getNextInvoiceNumber);

router.route('/:id')
    .delete(protect, deleteFoodInvoice);

module.exports = router;
