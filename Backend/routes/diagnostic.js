const express = require('express');
const router = express.Router();
const { checkBankLedgerData, fixBankLedgerNames } = require('../controllers/diagnosticController');
const BankTransaction = require('../models/BankTransaction');

// Public endpoints for debugging - NO AUTHENTICATION
router.get('/bank-ledger-check', checkBankLedgerData);
router.get('/fix-bank-ledger-names', fixBankLedgerNames);

// Check user role
router.get('/check-user-role/:name', async (req, res) => {
    try {
        const User = require('../models/User');
        const user = await User.findOne({ name: new RegExp(req.params.name, 'i') }).select('name role');
        res.json({ found: !!user, name: user?.name, role: user?.role });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ONE-TIME production DB fix — safe to call multiple times (idempotent)
router.get('/run-db-fix-june2026', async (req, res) => {
    try {
        const results = [];

        // FIX 1: Corrupted date on BLUE BIRDS ENTERPRISES
        const corrupt = await BankTransaction.findOne({
            narration: /BLUE BIRDS/i,
            bankName: 'HBL (MED)',
            amount: 108435
        });
        if (corrupt && corrupt.date?.getFullYear() < 2000) {
            const correctedDate = new Date(corrupt.createdAt);
            await BankTransaction.updateOne({ _id: corrupt._id }, { $set: { date: correctedDate } });
            results.push(`FIX1: Corrected BLUE BIRDS date to ${correctedDate.toISOString().split('T')[0]}`);
        } else {
            results.push('FIX1: BLUE BIRDS already correct or not found, skipped.');
        }

        // FIX 2: Delete wrong 478,000 CASH DEPOSIT (HBL MED)
        const wrongDeposit = await BankTransaction.findOne({
            narration: 'CASH DEPOSIT',
            bankName: 'HBL (MED)',
            amount: 478000,
            type: 'deposit',
            refType: 'manual'
        });
        if (wrongDeposit) {
            await BankTransaction.deleteOne({ _id: wrongDeposit._id });
            results.push(`FIX2: Deleted 478,000 CASH DEPOSIT (date: ${wrongDeposit.date?.toISOString().split('T')[0]})`);
        } else {
            results.push('FIX2: 478,000 CASH DEPOSIT not found, skipped.');
        }

        res.json({ success: true, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
