const mongoose = require('mongoose');

async function main() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/bas_db');
        const col = mongoose.connection.collection('employees');
        const emps = await col.find({}).toArray();
        console.log('Total employees:', emps.length);
        const faceEmps = emps.filter(e => (e.faceTemplate && e.faceTemplate.length > 0) || (e.fingerprintTemplate && typeof e.fingerprintTemplate === 'string' && e.fingerprintTemplate.includes('faceTemplate')));
        console.log('Employees with face template:', faceEmps.length);
        faceEmps.forEach(e => {
            console.log(`- [${e.code}] ${e.name} (Branch: ${e.branch}): templateLen=${e.faceTemplate ? e.faceTemplate.length : 'inside fp'}`);
        });

        // Also check Muhammad Bilal
        const bilal = emps.find(e => String(e.code) === '3428' || (e.name && e.name.toLowerCase().includes('bilal')));
        if (bilal) {
            console.log(`Bilal details: [${bilal.code}] ${bilal.name}, hasFaceTemplate=${!!(bilal.faceTemplate && bilal.faceTemplate.length > 0)}, branch=${bilal.branch}`);
        } else {
            console.log('Bilal not found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
