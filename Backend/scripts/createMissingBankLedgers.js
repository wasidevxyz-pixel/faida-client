const mongoose = require('mongoose');
const path = require('path');
const Bank = require(path.join(__dirname, '../models/Bank'));
const Ledger = require(path.join(__dirname, '../models/Ledger'));
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function createMissingBankLedgers() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to database');

        // Get all active banks
        const banks = await Bank.find({ isActive: true });
        console.log(`Found ${banks.length} active banks`);

        // Get all existing bank ledgers
        const existingLedgers = await Ledger.find({ ledgerType: 'bank' });
        const existingLedgerNames = existingLedgers.map(l => l.ledgerName);
        console.log(`Found ${existingLedgers.length} existing bank ledgers`);

        // Create ledgers for banks that don't have one
        let created = 0;
        for (const bank of banks) {
            if (!existingLedgerNames.includes(bank.bankName)) {
                try {
                    await Ledger.create({
                        ledgerName: bank.bankName,
                        ledgerType: 'bank',
                        openingBalance: 0,
                        currentBalance: 0,
                        isActive: true
                    });
                    console.log(`✓ Created ledger for: ${bank.bankName}`);
                    created++;
                } catch (error) {
                    console.error(`✗ Failed to create ledger for ${bank.bankName}:`, error.message);
                }
            } else {
                console.log(`- Ledger already exists for: ${bank.bankName}`);
            }
        }

        console.log(`\nSummary: Created ${created} new bank ledgers`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

createMissingBankLedgers();
