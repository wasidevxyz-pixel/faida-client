const express = require('express');
const router = express.Router();
const {
    createBankTransfer,
    getBankTransfers,
    deleteBankTransfer
} = require('../controllers/bankTransferController');
const { protect, accountsAccess, adminAccess } = require('../middleware/auth');

router.get('/', protect, accountsAccess, getBankTransfers);
router.post('/', protect, accountsAccess, createBankTransfer);
router.delete('/:id', protect, adminAccess, deleteBankTransfer);

module.exports = router;
