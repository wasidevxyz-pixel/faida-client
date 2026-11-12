const mongoose = require('mongoose');
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';

function cleanRemarksString(str) {
    if (!str || typeof str !== 'string') return str;
    const parts = str.split('|').map(s => s.trim()).filter(Boolean);
    
    // Keep first check-in and last check-out, plus other non-checkin/out remarks
    let checkIn = null;
    let checkOut = null;
    const others = [];

    for (const p of parts) {
        if (p.startsWith('Check-in from')) {
            if (!checkIn) checkIn = p; // keep first check-in
        } else if (p.startsWith('Check-out from')) {
            checkOut = p; // keep latest check-out
        } else {
            others.push(p);
        }
    }

    const clean = [];
    if (checkIn) clean.push(checkIn);
    if (checkOut) clean.push(checkOut);
    clean.push(...others);

    return clean.join(' | ');
}

async function main() {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));

    const records = await Attendance.find({
        remarks: { $regex: /Check-out from.*Check-out from/ }
    });

    console.log(`Found ${records.length} records with repeated Check-out remarks.`);

    for (const rec of records) {
        const original = rec.get('remarks');
        const cleaned = cleanRemarksString(original);
        console.log(`\nEmployee: ${rec.get('code')}`);
        console.log(`Before: ${original.slice(0, 100)}... (length: ${original.length})`);
        console.log(`After:  ${cleaned}`);
        await Attendance.updateOne({ _id: rec._id }, { $set: { remarks: cleaned } });
    }

    console.log('\nAll repeated remarks successfully cleaned!');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
