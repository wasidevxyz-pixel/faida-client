const mongoose = require('mongoose');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function verifyCounts() {
    try {
        await mongoose.connect(MONGO_URI);
        const regularEmps = await Employee.find({ 
            payrollImportOnly: { $ne: true }, 
            code: { $not: /^IMP-/i } 
        }).select('_id');
        const empIds = regularEmps.map(e => e._id);
        
        const countAllTime = await Payroll.countDocuments({ 
            employee: { $in: empIds }, 
            totalAdv: { $gt: 0 } 
        });
        const countMarch2026 = await Payroll.countDocuments({ 
            employee: { $in: empIds }, 
            monthYear: '2026-03', 
            totalAdv: { $gt: 0 } 
        });
        
        console.log(`TOTAL DEDUCTIONS (ALL TIME): ${countAllTime}`);
        console.log(`MARCH 2026 DEDUCTIONS: ${countMarch2026}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyCounts();
