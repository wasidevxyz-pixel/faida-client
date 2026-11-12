/**
 * PRODUCTION DATABASE FIX SCRIPT
 *
 * Option A — run locally pointing at production DB:
 *   node Backend/scripts/production-db-fix.js mongodb+srv://user:pass@host/BAS-SOFTWARE
 *
 * Option B — run on the production server:
 *   node Backend/scripts/production-db-fix.js
 *   (reads MONGO_URI from Backend/.env automatically)
 *
 * Fixes:
 *  1. Corrupted date on BLUE BIRDS ENTERPRISES transaction (year 0019 → 2026)
 *  2. Delete wrong 478,000 CASH DEPOSIT entry for HBL (MED)
 */

const mongoose = require('mongoose');
const path = require('path');

// Accept connection string as CLI argument OR read from .env
const MONGO_URI = process.argv[2] || (() => {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    return process.env.MONGO_URI;
})();

if (!MONGO_URI) {
    console.error('❌ No MongoDB URI found.');
    console.error('   Usage: node production-db-fix.js <mongo_uri>');
    console.error('   OR place MONGO_URI in Backend/.env');
    process.exit(1);
}

console.log('🔌 Connecting to:', MONGO_URI.replace(/:([^@]+)@/, ':****@'));

mongoose.connect(MONGO_URI).then(async () => {
    console.log('✅ Connected.\n');

    const BankTransaction = require('../models/BankTransaction');
    let fixCount = 0;

    // ── FIX 1: Corrupted date on BLUE BIRDS ENTERPRISES ──────────────────────
    const corrupt = await BankTransaction.findOne({
        narration: /BLUE BIRDS/i,
        bankName: 'HBL (MED)',
        amount: 108435
    });

    if (corrupt) {
        const badYear = corrupt.date?.getFullYear();
        if (badYear < 2000) {
            const correctedDate = new Date(corrupt.createdAt);
            await BankTransaction.updateOne(
                { _id: corrupt._id },
                { $set: { date: correctedDate } }
            );
            console.log(`✅ FIX 1: Corrected BLUE BIRDS date (was year ${badYear} → ${correctedDate.toISOString().split('T')[0]})`);
            fixCount++;
        } else {
            console.log(`ℹ️  FIX 1: BLUE BIRDS date already correct (${corrupt.date?.toISOString().split('T')[0]}), skipping.`);
        }
    } else {
        console.log('ℹ️  FIX 1: BLUE BIRDS record not found, skipping.');
    }

    // ── FIX 2: Delete wrong 478,000 CASH DEPOSIT (HBL MED, Jan 2026) ─────────
    const wrongDeposit = await BankTransaction.findOne({
        narration: 'CASH DEPOSIT',
        bankName: 'HBL (MED)',
        amount: 478000,
        type: 'deposit',
        refType: 'manual'
    });

    if (wrongDeposit) {
        const entryDate = wrongDeposit.date?.toISOString().split('T')[0];
        await BankTransaction.deleteOne({ _id: wrongDeposit._id });
        console.log(`✅ FIX 2: Deleted wrong 478,000 CASH DEPOSIT (HBL MED, date: ${entryDate})`);
        fixCount++;
    } else {
        console.log('ℹ️  FIX 2: 478,000 CASH DEPOSIT not found (already fixed or never existed), skipping.');
    }

    console.log(`\n🎉 Done. ${fixCount} fix(es) applied.`);
    mongoose.disconnect();
}).catch(e => {
    console.error('❌ Connection/Error:', e.message);
    process.exit(1);
});
