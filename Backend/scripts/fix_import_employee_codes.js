// Migration v2: Fix ALL import employees with high numeric codes
// Handles both payrollImportOnly=true AND old imports where flag was not set
// SAFE: Only touches employees with pure numeric codes > 5000

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');

// Threshold: any purely numeric code above this is considered an import artifact
// Real employees start at 3000. Adjust if your real employees ever went above 5000.
const REAL_EMP_CODE_LIMIT = 5000;

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to DB\n');

    // Step 1: Find highest REAL employee code (between 3000-5000 range, non-IMP)
    const allNonImp = await Employee.find({
        code: { $not: /^IMP-/i }
    }).select('code name payrollImportOnly').lean();

    // Separate real vs suspicious high-code employees
    const realEmps = allNonImp.filter(e => {
        const n = parseInt(e.code);
        return !isNaN(n) && n <= REAL_EMP_CODE_LIMIT;
    });
    const highCodeEmps = allNonImp.filter(e => {
        const n = parseInt(e.code);
        return !isNaN(n) && n > REAL_EMP_CODE_LIMIT;
    });

    console.log(`Real employees (code <= ${REAL_EMP_CODE_LIMIT}): ${realEmps.length}`);
    console.log(`Suspicious high-code employees (code > ${REAL_EMP_CODE_LIMIT}, no IMP- prefix): ${highCodeEmps.length}`);

    if (highCodeEmps.length === 0) {
        console.log('\n✅ No migration needed. All high-code employees already have IMP- prefix.');
        // Show current state
        const topReal = await Employee.find({
            payrollImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        }).sort({ code: -1 }).limit(3).select('code name').lean();
        console.log('\nTop 3 real employees by code:');
        topReal.forEach(e => console.log(`  code=${e.code}  name=${e.name}`));
        await mongoose.disconnect();
        return;
    }

    console.log('\nSample high-code employees to be fixed:');
    highCodeEmps.slice(0, 5).forEach(e =>
        console.log(`  code=${e.code}  name=${e.name}  payrollImportOnly=${e.payrollImportOnly}`)
    );

    // Step 2: Find next available IMP- code
    const allImpEmps = await Employee.find({ code: /^IMP-/i }, 'code').lean();
    const existingImpNums = new Set(
        allImpEmps
            .map(e => { const m = e.code.match(/^IMP-(\d+)$/i); return m ? parseInt(m[1]) : null; })
            .filter(n => n !== null)
    );
    let nextImpNum = 90000;
    while (existingImpNums.has(nextImpNum)) nextImpNum++;
    console.log(`\nStarting new IMP- codes from: IMP-${nextImpNum}\n`);

    // Step 3: Fix each high-code employee
    let fixed = 0, failed = 0;
    for (const emp of highCodeEmps) {
        const oldCode = emp.code;
        let newCode = `IMP-${nextImpNum++}`;
        while (existingImpNums.has(parseInt(newCode.replace('IMP-', '')))) {
            newCode = `IMP-${nextImpNum++}`;
        }
        existingImpNums.add(parseInt(newCode.replace('IMP-', '')));

        try {
            // Update Employee: rename code AND ensure payrollImportOnly=true
            await Employee.findByIdAndUpdate(emp._id, {
                code: newCode,
                payrollImportOnly: true
            });

            // Update any Payroll records referencing the old code
            const payrollResult = await Payroll.updateMany(
                { code: oldCode },
                { $set: { code: newCode } }
            );

            console.log(`  ✅ "${emp.name}": ${oldCode} → ${newCode}  (payrolls updated: ${payrollResult.modifiedCount})`);
            fixed++;
        } catch (err) {
            console.log(`  ❌ Failed: ${emp.name} (${oldCode}): ${err.message}`);
            failed++;
        }
    }

    console.log(`\n✅ Migration complete: ${fixed} fixed, ${failed} failed.`);

    // Step 4: Verify result
    const realLast = await Employee.findOne({
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    }).sort({ code: -1 }).select('code name').lean();

    console.log('\n--- Verification ---');
    console.log(`Highest real employee: code=${realLast?.code}  name=${realLast?.name}`);
    console.log(`Next registration code will be: ${String(parseInt(realLast?.code || '3000') + 1).padStart(4, '0')}`);
    console.log('\n✅ Done. Please restart the server now.');

    await mongoose.disconnect();
}

run().catch(err => { console.error('❌ Migration failed:', err.message); process.exit(1); });
