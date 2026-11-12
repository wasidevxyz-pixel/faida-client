/**
 * Reset AI providers in MongoDB — clears offline/disabled status
 * and re-syncs API keys + models from .env.providers
 * Run: node Backend/scripts/reset-ai-providers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.providers'), override: false });

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const col = db.collection('aiproviders');

    const ENV_MAP = [
        ['groq',       process.env.GROQ_API_KEY,        process.env.GROQ_MODEL        || 'llama-3.1-8b-instant'],
        ['sambanova',  process.env.SAMBANOVA_API_KEY,    process.env.SAMBANOVA_MODEL   || 'Meta-Llama-3.1-8B-Instruct'],
        ['openrouter', process.env.OPENROUTER_API_KEY,   process.env.OPENROUTER_MODEL  || 'mistralai/mistral-7b-instruct:free'],
        ['gemini',     process.env.GEMINI_API_KEY,       process.env.GEMINI_MODEL      || 'gemini-2.0-flash'],
    ];

    for (const [name, apiKey, model] of ENV_MAP) {
        if (!apiKey) { console.log(`⚠️  Skipping ${name} — no API key`); continue; }

        const result = await col.updateOne(
            { name },
            { $set: {
                apiKey,
                model,
                enabled: true,
                healthStatus: 'unknown',
                lastError: '',
                totalFailures: 0
            }},
            { upsert: true }
        );
        console.log(`✅ ${name}: reset to enabled, model=${model} (${result.modifiedCount ? 'updated' : 'upserted'})`);
    }

    // Also reset any offline providers to unknown so they get retried
    await col.updateMany(
        { healthStatus: { $in: ['offline', 'disabled'] } },
        { $set: { healthStatus: 'unknown', lastError: '' } }
    );
    console.log('\n✅ All offline/disabled providers reset to unknown.');
    console.log('Restart your server now: pm2 restart bas-serv\n');

    await mongoose.disconnect();
}).catch(e => { console.error('Error:', e.message); process.exit(1); });
