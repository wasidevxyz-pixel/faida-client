require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.providers'), override: false });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const providers = await db.collection('aiproviders').find({}).toArray();
    console.log('\n=== AI PROVIDERS STATUS ===\n');
    providers.forEach(p => {
        console.log(`[${p.name}]`);
        console.log(`  enabled:      ${p.enabled}`);
        console.log(`  healthStatus: ${p.healthStatus}`);
        console.log(`  model:        ${p.model}`);
        console.log(`  hasKey:       ${p.apiKey ? 'YES' : 'NO'}`);
        console.log(`  lastError:    ${p.lastError || 'none'}`);
        console.log('');
    });
    await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
