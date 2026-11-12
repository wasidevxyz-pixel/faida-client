const mongoose = require('mongoose');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const { recalculateAdvanceBalances } = require('./employeeAdvanceController');
const { recalculateEmployeeLedger } = require('./employeeLedgerController');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function runSafeRepair() {
    try {
        console.log('--- JOINING DB ---');
        await mongoose.connect(MONGO_URI);
        console.log('--- CONNECTED ---');

        const ADMIN_ID = '67389ff4c6c0349f7d04f2d7'; // User ID for tracking

        // 1. RE-SYNC ONLY THE ONES YOU MANUALLY DID FOR G15 AND OPTICIAN IN MARCH
        const targetBranches = ['(G15 Markaz)', '(Optician ISB)']; 
        
        const payrollsToRepair = await Payroll.find({
            monthYear: '2026-03',
            branch: { $in: targetBranches },
            totalAdv: { $gt: 0 }
        });
        
        console.log(`Checking ${payrollsToRepair.length} manual payrolls for missing ledger entries...`);

        let synced = 0;
        const affectedEmps = new Set();
        for (const p of payrollsToRepair) {
            // Check if it already exists to be safe
            const existing = await EmployeeAdvance.findOne({ payroll: p._id, transactionType: 'Received' });
            if (existing) continue;

            const emp = await Employee.findById(p.employee).select('code payrollImportOnly');
            if (emp && !emp.payrollImportOnly && !(emp.code && emp.code.toUpperCase().startsWith('IMP-'))) {
                const deductionAmount = parseFloat(p.totalAdv || 0);
                const [y, m] = p.monthYear.split('-').map(Number);
                const deductionDate = new Date(Date.UTC(y, m - 1, 15));

                await EmployeeAdvance.create({
                    employee: p.employee,
                    payroll: p._id,
                    date: deductionDate,
                    branch: p.branch,
                    transactionType: 'Received',
                    code: p.code,
                    paid: deductionAmount,
                    remarks: `Salary Deduction [Payroll: ${p.monthYear}]`,
                    createdBy: ADMIN_ID,
                    updatedBy: ADMIN_ID
                });
                affectedEmps.add(p.employee.toString());
                synced++;
            }
        }
        console.log(`Sync complete. Added ${synced} missing records.`);

        console.log('--- RECALCULATING BALANCES FOR AFFECTED EMPLOYEES ---');
        for (const empId of affectedEmps) {
            await recalculateAdvanceBalances(empId);
            await recalculateEmployeeLedger(empId);
        }

        console.log('--- ALL DONE! REPAIR SUCCEEDED SAFELY ---');
        process.exit(0);

    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}

runSafeRepair();
