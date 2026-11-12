// Simple migration script: copy `name` into `name_urdu` for employees missing it.
// Usage: node scripts/migrate_name_urdu.js

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Use same connection string as Backend/server.js
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory';
console.log('Connecting to:', mongoUri);

const Employee = require(path.join(__dirname, '..', 'Backend', 'models', 'Employee'));

(async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Find all employees without name_urdu
        const employees = await Employee.find({
            $or: [ 
                { name_urdu: { $exists: false } }, 
                { name_urdu: null },
                { name_urdu: '' } 
            ]
        });

        console.log(`Found ${employees.length} employees without name_urdu`);

        let updated = 0;
        for (const emp of employees) {
            if (emp.name && !emp.name_urdu) {
                emp.name_urdu = emp.name;
                await emp.save();
                updated++;
            }
        }

        console.log(`Successfully updated ${updated} employees`);
        const res = { modifiedCount: updated };

        console.log('Migration result:', res);
        await mongoose.disconnect();
        console.log('Done');
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
})();
