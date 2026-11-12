const mongoose = require('mongoose');

async function check() {
    const dbNames = ['BAS-SOFTWARE', 'bas_db', 'sales-inventory', 'vehicle_management'];
    try {
        for (const dbName of dbNames) {
            await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`);
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log(`--- DB: ${dbName} ---`);
            for (const col of collections) {
                if (col.name.includes('employee') || col.name.includes('user')) {
                    const count = await mongoose.connection.collection(col.name).countDocuments({});
                    console.log(`Collection: ${col.name}, Count: ${count}`);
                }
            }
            await mongoose.disconnect();
        }
        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err.message);
        process.exit(1);
    }
}

check();
