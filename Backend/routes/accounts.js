const express = require('express');
const router = express.Router();
const {
    getAccountGroups,
    createAccountGroup,
    updateAccountGroup,
    deleteAccountGroup,
    getAccountCategories,
    createAccountCategory,
    updateAccountCategory,
    deleteAccountCategory,
    getAccounts,
    createAccount,
    updateAccount,
    deleteAccount
} = require('../controllers/accountSetupController');

const { protect, authorize } = require('../middleware/auth');
const { accountValidations, handleValidationErrors } = require('../middleware/validation');

// Account Groups
router.route('/groups')
    .get(protect, getAccountGroups)
    .post(protect, authorize('admin', 'manager'), accountValidations.setup, handleValidationErrors, createAccountGroup);

router.route('/groups/:id')
    .put(protect, authorize('admin', 'manager'), updateAccountGroup)
    .delete(protect, authorize('admin'), deleteAccountGroup);

// Account Categories
router.route('/categories')
    .get(protect, getAccountCategories)
    .post(protect, authorize('admin', 'manager'), accountValidations.setup, handleValidationErrors, createAccountCategory);

router.route('/categories/:id')
    .put(protect, authorize('admin', 'manager'), updateAccountCategory)
    .delete(protect, authorize('admin'), deleteAccountCategory);

// Accounts
router.route('/ledger') // '/api/v1/accounts/ledger'
    .get(protect, getAccounts)
    .post(protect, authorize('admin', 'manager'), accountValidations.ledger, handleValidationErrors, createAccount);

router.route('/ledger/:id')
    .put(protect, authorize('admin', 'manager'), updateAccount)
    .delete(protect, authorize('admin'), deleteAccount);

module.exports = router;
