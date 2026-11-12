// Diagnostic: Check employee code distribution in database
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../models/Employee');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB\n');

    // 1. Total employees
    const total = await Employee.countDocuments();
    console.log(`Total employees: ${total}`);

    // 2. payrollImportOnly employees
    const importOnly = await Employee.countDocuments({ payrollImportOnly: true });
    console.log(`payrollImportOnly: ${importOnly}`);

    // 3. IMP- prefixed employees
    const impPrefix = await Employee.countDocuments({ code: /^IMP-/i });
    console.log(`IMP- prefixed codes: ${impPrefix}`);

    // 4. Employees with numeric codes > 9000 (suspicious high codes)
    const highCodeEmps = await Employee.find({
        code: { $not: /^IMP-/i }
    }).select('code name payrollImportOnly').lean();

    // Filter those with numeric codes > 9000
    const highNums = highCodeEmps.filter(e => {
        const m = String(e.code).match(/^\d+$/);
        return m && parseInt(e.code) > 9000;
    });

    console.log(`\nEmployees with purely numeric codes > 9000: ${highNums.length}`);
    highNums.slice(0, 20).forEach(e => {
        console.log(`  code=${e.code}  name=${e.name}  payrollImportOnly=${e.payrollImportOnly}`);
    });

    // 5. Highest real (non-IMP, non-payrollImportOnly) employee code
    const realLast = await Employee.findOne({
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    }).sort({ code: -1 }).select('code name').lean();
    console.log(`\nHighest non-IMP, non-payrollImportOnly employee: code=${realLast?.code}  name=${realLast?.name}`);

    // 6. Real employees sorted top 5
    const topReal = await Employee.find({
        payrollImportOnly: { $ne: true },
        code: { $not: /^IMP-/i }
    }).sort({ code: -1 }).limit(10).select('code name').lean();
    console.log('\nTop 10 non-IMP employees by code:');
    topReal.forEach(e => console.log(`  code=${e.code}  name=${e.name}`));

    await mongoose.disconnect();
}

run().catch(console.error);
