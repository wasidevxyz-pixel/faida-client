const express = require('express');
const router = express.Router();
const {
    getCompanies,
    getCompany,
    createCompany,
    updateCompany,
    deleteCompany
} = require('../controllers/companyController');
const { protect, authorize } = require('../middleware/auth');

router
    .route('/')
    .get(protect, getCompanies)
    .post(protect, authorize('admin', 'manager'), createCompany);

router
    .route('/:id')
    .get(protect, getCompany)
    .put(protect, authorize('admin', 'manager'), updateCompany)
    .delete(protect, authorize('admin', 'manager'), deleteCompany);

module.exports = router;
