const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Local Models
const WHItem = require('./models/WHItem');

// Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sales-inventory';
const OUTPUT_FILE = path.join(__dirname, 'update-incentives-script.js');

(async () => {
    try {
        console.log('🔌 Connecting to DB to export INCENTIVE data...');
        await mongoose.connect(MONGO_URI, { family: 4 });

        // Fetch just items with name/code and incentive
        console.log('📥 Fetching items...');
        const items = await WHItem.find({}, { itemsCode: 1, incentive: 1, name: 1 });

        console.log(`📊 Found ${items.length} items to export incentives for.`);

        // Generate Script Content
        const scriptContent = `
const mongoose = require('mongoose');

// CONFIGURATION
// 🔴 Change this if your second system uses a different DB URL
const TARGET_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sales-inventory';

// INCENTIVE DATA ONLY
const ITEMS_DATA = ${JSON.stringify(items, null, 0)};

(async () => {
    try {
        console.log('🔌 Connecting to Target DB:', TARGET_MONGO_URI);
        const conn = await mongoose.createConnection(TARGET_MONGO_URI, { family: 4 }).asPromise();
        console.log('✅ Connected.');
        
        const WHItems = conn.collection('whitems');

        console.log(\`🔄 Updating Incentives for \${ITEMS_DATA.length} items...\`);

        const bulkOps = ITEMS_DATA.map(item => ({
            updateOne: {
                filter: { itemsCode: item.itemsCode },
                update: { $set: { incentive: item.incentive || 0 } }
            }
        }));

        if (bulkOps.length > 0) {
            const result = await WHItems.bulkWrite(bulkOps);
            console.log(\`✅ Sync Complete!\`);
            console.log(\`   - Matched: \${result.nMatched}\`);
            console.log(\`   - Modified: \${result.nModified}\`);
        } else {
            console.log('⚠️ No data to update.');
        }

        console.log('\\n🎉 INCENTIVE UPDATE COMPLETE!');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
})();
`;

        fs.writeFileSync(OUTPUT_FILE, scriptContent);
        console.log(`\n✅ GENERATED SUCCESSFULY: ${OUTPUT_FILE}`);
        console.log('👉 You can copy this file to your second system and run: node update-incentives-script.js');

        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
