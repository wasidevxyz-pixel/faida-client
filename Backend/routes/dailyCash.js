const express = require('express');
const router = express.Router();
const {
    getDailyCash,
    createDailyCash,
    updateDailyCash,
    deleteDailyCash,
    verifyDailyCash
} = require('../controllers/dailyCashController');

const { protect, accountsAccess } = require('../middleware/auth');

// Helper search
router.get('/', protect, getDailyCash);
router.post('/', protect, accountsAccess, createDailyCash);

// Bulk Update - Changed name to avoid conflict with /:id
router.put('/bulk-verify-status', protect, accountsAccess, verifyDailyCash);

// Single record updates
router.put('/:id', protect, accountsAccess, updateDailyCash);
router.delete('/:id', protect, accountsAccess, deleteDailyCash);

module.exports = router;
