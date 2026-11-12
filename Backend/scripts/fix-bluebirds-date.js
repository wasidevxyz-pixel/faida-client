const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('banktransactions');

    // Find the record
    const record = await collection.findOne({
        $or: [
            { narration: /BLUE BIRDS/i },
            { narration: /BLUEBIRDS/i },
            { narration: /00002460/i }
        ],
        amount: 108435
    });

    if (!record) {
        console.log('Record not found. Searching all records with amount 108435...');
        const all = await collection.find({ amount: 108435 }).toArray();
        console.log(`Found ${all.length} record(s):`);
        all.forEach(r => console.log(JSON.stringify({
            _id: r._id,
            narration: r.narration,
            bankName: r.bankName,
            date: r.date,
            amount: r.amount
        })));
        await mongoose.disconnect();
        return;
    }

    console.log('Found record:');
    console.log(JSON.stringify({
        _id: record._id,
        narration: record.narration,
        bankName: record.bankName,
        date: record.date,
        amount: record.amount
    }, null, 2));

    // Set exact date: 19 May 2026
    const correctDate = new Date('2026-05-19T00:00:00.000Z');

    await collection.updateOne(
        { _id: record._id },
        { $set: { date: correctDate } }
    );

    console.log('✅ Date fixed to: 2026-05-19');
    await mongoose.disconnect();

}).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
