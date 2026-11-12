const mongoose = require('mongoose');

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    const Employee = mongoose.model('Employee', new mongoose.Schema({
        code: String,
        name: String,
        fingerprintTemplate: String
    }));
    const emps = await Employee.find({ code: { $in: ['3339', '3428', '3431'] } });
    console.log('Local DB emps count:', emps.length);
    emps.forEach(e => {
        console.log(e.code, e.name, 'hasFP:', !!e.fingerprintTemplate, 'isJSON:', e.fingerprintTemplate ? e.fingerprintTemplate.startsWith('{') : false, 'len:', e.fingerprintTemplate ? e.fingerprintTemplate.length : 0);
        if (e.fingerprintTemplate && !e.fingerprintTemplate.startsWith('{')) {
            console.log('Valid FP snippet:', e.fingerprintTemplate.slice(0, 30));
        }
    });
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
