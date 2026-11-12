const mongoose = require('mongoose');
const fs = require('fs');

async function check() {
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    const db = mongoose.connection.db;
    const item = await db.collection('whitems').findOne({ itemsCode: '2000' });
    if (item) {
        const logs = await db.collection('whstocklogs').find({ item: item._id }).sort({ createdAt: -1 }).limit(50).toArray();
        fs.writeFileSync('full_logs_50.json', JSON.stringify(logs, null, 2), 'utf8');
    }
    process.exit();
}
check();
