const mongoose = require('mongoose');
const WHItem = require('./models/WHItem');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sales-inventory";

(async () => {
    try {
        console.log('Connecting to:', MONGO_URI);
        await mongoose.connect(MONGO_URI, { family: 4 });
        const count = await WHItem.countDocuments();
        console.log(`\n✅ Total WHItems in DB: ${count}`);

        const sample = await WHItem.findOne().sort({ createdAt: -1 });
        if (sample) {
            console.log('Sample Item:', sample.name);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
