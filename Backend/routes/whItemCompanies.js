const express = require('express');
const router = express.Router();
const {
    getCompanies,
    createCompany,
    updateCompany,
    deleteCompany
} = require('../controllers/whItemCompanyController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getCompanies)
    .post(createCompany);

router.route('/:id')
    .put(updateCompany)
    .delete(deleteCompany);

module.exports = router;
