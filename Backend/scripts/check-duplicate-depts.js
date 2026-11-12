require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');

async function checkDuplicates() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected.');

        const depts = await Department.find({ name: 'MEDICINE' });
        console.log('--- MEDICINE Departments ---');
        depts.forEach(d => {
            console.log(`ID: ${d._id}, Check Code: ${d.code}, Branch: ${d.branch}, Active: ${d.isActive}`);
        });

        const allDepts = await Department.find({});
        console.log('\n--- All Departments ---');
        allDepts.forEach(d => {
            console.log(`Name: ${d.name}, Code: ${d.code}, Branch: ${d.branch}, ID: ${d._id}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkDuplicates();
