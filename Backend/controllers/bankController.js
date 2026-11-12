const Bank = require('../models/Bank');
const Store = require('../models/Store');

exports.getBanks = async (req, res) => {
    try {
        let query = { isActive: true };

        if (req.query.branch) {
            const branchInput = req.query.branch;
            
            // Robust Branch Filter: Match Name OR ID (handles branch name format mismatches)
            let branchIds = [branchInput]; // Start with the input itself
            
            // Try to resolve to Store to get both name and ID
            const store = await Store.findOne({
                $or: [
                    { name: branchInput }, 
                    { _id: branchInput && branchInput.match(/^[0-9a-fA-F]{24}$/) ? branchInput : null }
                ]
            }).lean();
            
            if (store) {
                branchIds = [store.name, store._id.toString()];
            }
            
            // Create query that matches either name or ID
            query.branch = { $in: branchIds };
        }

        const banks = await Bank.find(query).sort({ bankName: 1 });

        res.status(200).json({ success: true, data: banks });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getBank = async (req, res) => {
    try {
        const bank = await Bank.findById(req.params.id);
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        res.status(200).json({ success: true, data: bank });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// Helper: enforce only one payroll bank per branch
async function enforceOnePayrollBank(branch, excludeId = null) {
    if (!branch) return;
    const q = { branch, isPayrollBank: true };
    if (excludeId) q._id = { $ne: excludeId };
    await Bank.updateMany(q, { $set: { isPayrollBank: false } });
}

exports.createBank = async (req, res) => {
    try {
        const Ledger = require('../models/Ledger');

        // If this new bank is flagged as payroll bank, clear the flag from others in the same branch
        if (req.body.isPayrollBank && req.body.branch) {
            await enforceOnePayrollBank(req.body.branch);
        }

        // Create the bank
        const bank = await Bank.create(req.body);

        // Automatically create a corresponding ledger account
        try {
            await Ledger.create({
                ledgerName: bank.bankName,
                ledgerType: 'bank',
                openingBalance: 0,
                currentBalance: 0,
                isActive: true
            });
            console.log(`Ledger account created for bank: ${bank.bankName}`);
        } catch (ledgerError) {
            console.error(`Failed to create ledger for bank ${bank.bankName}:`, ledgerError.message);
            // Don't fail the bank creation if ledger creation fails
        }

        res.status(201).json({ success: true, data: bank });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateBank = async (req, res) => {
    try {
        // If setting as payroll bank, clear the flag from other banks of same branch first
        if (req.body.isPayrollBank) {
            const existing = await Bank.findById(req.params.id).lean();
            const branch = req.body.branch || existing?.branch;
            if (branch) await enforceOnePayrollBank(branch, req.params.id);
        }
        const bank = await Bank.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        res.status(200).json({ success: true, data: bank });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get payroll bank for a branch
// @route   GET /api/v1/banks/payroll-bank?branch=BranchName
exports.getPayrollBank = async (req, res) => {
    try {
        if (!req.query.branch) return res.status(400).json({ success: false, message: 'branch query param required' });
        const bank = await Bank.findOne({ branch: req.query.branch, isPayrollBank: true, isActive: true });
        res.status(200).json({ success: true, data: bank || null });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteBank = async (req, res) => {
    try {
        const bank = await Bank.findByIdAndDelete(req.params.id);
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createMissingBankLedgers = async (req, res) => {
    try {
        const Ledger = require('../models/Ledger');

        // Get all active banks
        const banks = await Bank.find({ isActive: true });

        // Get all existing bank ledgers
        const existingLedgers = await Ledger.find({ ledgerType: 'bank' });
        const existingLedgerNames = existingLedgers.map(l => l.ledgerName);

        // Create ledgers for banks that don't have one
        const created = [];
        const skipped = [];
        const failed = [];

        for (const bank of banks) {
            if (!existingLedgerNames.includes(bank.bankName)) {
                try {
                    await Ledger.create({
                        ledgerName: bank.bankName,
                        ledgerType: 'bank',
                        openingBalance: 0,
                        currentBalance: 0,
                        isActive: true,
                        createdBy: req.user._id  // Add the authenticated user ID
                    });
                    created.push(bank.bankName);
                } catch (error) {
                    console.error(`Failed to create ledger for ${bank.bankName}:`, error.message);
                    failed.push({ bank: bank.bankName, error: error.message });
                }
            } else {
                skipped.push(bank.bankName);
            }
        }

        res.status(200).json({
            success: true,
            message: `Created ${created.length} new bank ledgers`,
            data: { created, skipped, failed }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
