const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
require('dotenv').config({ path: '../.env' });

async function fixBalances() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const employees = await Employee.find({});
        console.log(`Processing ${employees.length} employees...`);

        for (const emp of employees) {
            const advances = await EmployeeAdvance.find({ employee: emp._id }).sort({ date: 1, createdAt: 1 });
            if (advances.length === 0) continue;

            console.log(`Recalculating for ${emp.name} (${advances.length} advances)...`);

            // Group by month
            const monthlyGroups = {};
            advances.forEach(adv => {
                const d = new Date(adv.date);
                const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                if (!monthlyGroups[key]) monthlyGroups[key] = [];
                monthlyGroups[key].push(adv);
            });

            const sortedMonths = Object.keys(monthlyGroups).sort();
            let runningBalance = parseFloat(emp.opening || 0);

            for (const monthKey of sortedMonths) {
                const monthAdvs = monthlyGroups[monthKey];
                const monthPreBal = runningBalance;

                let monthNetChange = 0;
                monthAdvs.forEach(adv => {
                    const amt = parseFloat(adv.paid || 0);
                    monthNetChange += (adv.transactionType === 'Pay' ? amt : -amt);
                });

                for (const adv of monthAdvs) {
                    const amt = parseFloat(adv.paid || 0);
                    const currentMonthBal = monthNetChange - (adv.transactionType === 'Pay' ? amt : -amt);
                    const total = monthPreBal + currentMonthBal;
                    const balance = monthPreBal + monthNetChange;

                    await EmployeeAdvance.findByIdAndUpdate(adv._id, {
                        preMonthBal: monthPreBal,
                        currentMonthBal: currentMonthBal,
                        total: total,
                        balance: balance
                    });
                }
                runningBalance += monthNetChange;
            }
        }

        console.log('Done!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixBalances();
