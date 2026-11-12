const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
// Load environment variables if they exist
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');

const exportPath = 'D:\\BAS-NEW-SOFT\\BAS-SOFTWARE\\EXPORT\\Employee_Registration_Export.csv';

async function exportEmployees() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Database connected.');

        console.log('Fetching active employees...');
        // We include .setOptions({ includeImpEmployees: true }) to catch everyone if needed,
        // but user requested from registration so we stick to standard ones (isActive: true)
        const employees = await Employee.find({ isActive: true })
            .populate('department')
            .populate('designation')
            .sort({ branch: 1, name: 1 }); // Sorted branch-wise then name-wise

        console.log(`Found ${employees.length} employees.`);

        let csv = '\uFEFF'; // Add BOM for Excel UTF-8 support
        csv += 'Employee Name,Department,Designation,Phone Number,Branch\n';

        employees.forEach(emp => {
            const name = (emp.name || '').replace(/"/g, '""');
            const dept = (emp.department ? emp.department.name : '').replace(/"/g, '""');
            const desg = (emp.designation ? emp.designation.name : '').replace(/"/g, '""');
            const phone = (emp.mobileNo || '').replace(/"/g, '""');
            const branch = (emp.branch || '').replace(/"/g, '""');

            csv += `"${name}","${dept}","${desg}","${phone}","${branch}"\n`;
        });

        // Ensure directory exists
        const dir = path.dirname(exportPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(exportPath, csv);
        console.log(`--------------------------------------------------`);
        console.log(`SUCCESS: Exported ${employees.length} employees.`);
        console.log(`FILE SAVED TO: ${exportPath}`);
        console.log(`--------------------------------------------------`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('EXPORT FAILED:', err.message);
        process.exit(1);
    }
}

exportEmployees();
