/**
 * fix_import_advance_pollution.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE-TIME repair script.
 *
 * Problem:
 *   Previous Excel imports called syncPayrollAdvanceLedger() for real (non-IMP-)
 *   employees. This wrongly created EmployeeAdvance "Received" entries and
 *   rebuilt those employees' ledgers, breaking their advance balances.
 *
 * What this script does:
 *   1. Finds every Payroll record that was created by import
 *      (remarks includes "Bulk Import Row" OR code starts with "IMP-")
 *   2. Stamps those records with  isImportOnly: true
 *   3. Deletes any EmployeeAdvance "Received" entries that were linked to
 *      those payroll records (the ones wrongly written by syncPayrollAdvanceLedger)
 *   4. Recalculates the advance balance for every affected real employee
 *
 * Run once:
 *   node Backend/scripts/fix_import_advance_pollution.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const mongoose = require('mongoose');
const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Payroll         = require('../models/Payroll');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeLedger  = require('../models/EmployeeLedger');
const { recalculateEmployeeLedger } = require('../controllers/employeeLedgerController');

// ──────────────────────────────────────────────────────────────────────────────
// Inline balance recalculation (mirrors employeeAdvanceController logic)
// ──────────────────────────────────────────────────────────────────────────────
async function recalcBalance(employeeId) {
    const advances = await EmployeeAdvance.find({ employee: employeeId }).sort({ date: 1, createdAt: 1 }).lean();
    let running = 0;
    const ops = advances.map(a => {
        const amt = parseFloat(a.paid || 0);
        if (a.transactionType === 'Pay')      running += amt;
        if (a.transactionType === 'Received') running -= amt;
        return {
            updateOne: {
                filter: { _id: a._id },
                update: { $set: { balance: running } }
            }
        };
    });
    if (ops.length > 0) await EmployeeAdvance.bulkWrite(ops, { ordered: true });
}

// ──────────────────────────────────────────────────────────────────────────────
async function main() {
    await mongoose.connect(process.env.MONGO_URI || process.env.DB_URI || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ── Step 1: Find all import-created payroll records ───────────────────────
    const importPayrolls = await Payroll.find({
        $or: [
            { remarks: { $regex: /^Bulk Import Row/i } },
            { code:    { $regex: /^IMP-/i } }
        ]
    }).select('_id employee code remarks isImportOnly').lean();

    console.log(`\n📋 Found ${importPayrolls.length} import payroll records to process.`);
    if (importPayrolls.length === 0) {
        console.log('Nothing to do. Exiting.');
        await mongoose.disconnect();
        return;
    }

    const payrollIds  = importPayrolls.map(p => p._id);
    const employeeIds = [...new Set(importPayrolls.map(p => p.employee?.toString()).filter(Boolean))];

    // ── Step 2: Stamp them all as isImportOnly: true ──────────────────────────
    const stampResult = await Payroll.updateMany(
        { _id: { $in: payrollIds } },
        { $set: { isImportOnly: true } }
    );
    console.log(`\n🏷️  Stamped ${stampResult.modifiedCount} payroll records with isImportOnly=true`);

    // ── Step 3: Delete wrongly-created EmployeeAdvance "Received" entries ─────
    const deleteResult = await EmployeeAdvance.deleteMany({
        payroll:         { $in: payrollIds },
        transactionType: 'Received'
    });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} wrongly-created EmployeeAdvance "Received" entries`);

    // ── Step 4: Recalculate advance balances for all affected employees ────────
    console.log(`\n🔄 Recalculating advance balances for ${employeeIds.length} affected employees...`);
    let fixed = 0;
    for (const empId of employeeIds) {
        try {
            await recalcBalance(empId);
            // NEW: Also rebuild the ledger collection to clear imported payroll In/Out entries
            await recalculateEmployeeLedger(empId);
            fixed++;
            if (fixed % 20 === 0) console.log(`   ...${fixed}/${employeeIds.length}`);
        } catch (err) {
            console.error(`   ⚠️  Failed for employee ${empId}: ${err.message}`);
        }
    }
    console.log(`✅ Recalculated ${fixed}/${employeeIds.length} employee advance balances`);

    console.log('\n🎉 Repair complete. Import data is now fully isolated.');
    console.log('   • Main payroll screen  → no import records visible');
    console.log('   • Advance screen       → balances restored to pre-import state');
    console.log('   • Employee ledger      → no import pollution');
    console.log('   • Payroll List (import report) → still shows imported data\n');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});
