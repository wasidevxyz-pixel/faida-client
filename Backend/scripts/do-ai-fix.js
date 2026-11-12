/**
 * ALL-IN-ONE AI FIX SCRIPT
 * - Resets all providers in MongoDB
 * - Tests Groq directly
 * - Tests SambaNova directly
 * - Writes results to ai-fix-result.log
 */
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'ai-fix-result.log');
const log = (msg) => { fs.appendFileSync(logFile, msg + '\n'); console.log(msg); };

// Clear log
fs.writeFileSync(logFile, '=== AI FIX RUN: ' + new Date().toISOString() + ' ===\n\n');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.providers'), override: false });

const mongoose = require('mongoose');

const GROQ_KEY       = process.env.GROQ_API_KEY;
const SAMBANOVA_KEY  = process.env.SAMBANOVA_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;

log('Keys loaded:');
log('  GROQ:       ' + (GROQ_KEY       ? GROQ_KEY.slice(0,10) + '...' : 'MISSING'));
log('  SAMBANOVA:  ' + (SAMBANOVA_KEY  ? SAMBANOVA_KEY.slice(0,8)  + '...' : 'MISSING'));
log('  OPENROUTER: ' + (OPENROUTER_KEY ? OPENROUTER_KEY.slice(0,10) + '...' : 'MISSING'));
log('  GEMINI:     ' + (GEMINI_KEY     ? GEMINI_KEY.slice(0,10) + '...' : 'MISSING'));
log('');

async function testProvider(name, url, model, key) {
    log(`Testing ${name} (${model})...`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'say ok' }], max_tokens: 5 }),
            signal: AbortSignal.timeout(15000)
        });
        const data = await res.json();
        if (data?.choices?.[0]?.message?.content) {
            log(`  ✅ ${name} WORKS — response: "${data.choices[0].message.content.trim()}"`);
            return true;
        } else {
            log(`  ❌ ${name} FAILED — ${JSON.stringify(data?.error || data).slice(0, 200)}`);
            return false;
        }
    } catch (e) {
        log(`  ❌ ${name} ERROR — ${e.message}`);
        return false;
    }
}

async function resetMongo() {
    log('\n--- Resetting MongoDB AI providers ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const col = mongoose.connection.db.collection('aiproviders');

        const updates = [
            { name: 'groq',       apiKey: GROQ_KEY,       model: 'llama-3.1-8b-instant' },
            { name: 'sambanova',  apiKey: SAMBANOVA_KEY,   model: 'Meta-Llama-3.1-8B-Instruct' },
            { name: 'openrouter', apiKey: OPENROUTER_KEY,  model: 'mistralai/mistral-7b-instruct:free' },
            { name: 'gemini',     apiKey: GEMINI_KEY,      model: 'gemini-2.0-flash' },
        ];

        for (const u of updates) {
            if (!u.apiKey) { log(`  ⚠️  ${u.name} skipped — no key`); continue; }
            await col.updateOne(
                { name: u.name },
                { $set: { apiKey: u.apiKey, model: u.model, enabled: true, healthStatus: 'unknown', lastError: '', totalFailures: 0 } },
                { upsert: true }
            );
            log(`  ✅ ${u.name} reset in MongoDB`);
        }

        // Clear ALL offline/disabled
        const r = await col.updateMany(
            { healthStatus: { $in: ['offline', 'disabled'] } },
            { $set: { healthStatus: 'unknown', lastError: '' } }
        );
        log(`  ✅ Cleared ${r.modifiedCount} offline/disabled providers`);

        await mongoose.disconnect();
    } catch (e) {
        log(`  ❌ MongoDB error: ${e.message}`);
    }
}

async function main() {
    // Test all providers live
    log('--- Live API Tests ---');
    const groqOk       = await testProvider('Groq (8b-instant)',  'https://api.groq.com/openai/v1/chat/completions',      'llama-3.1-8b-instant',                    GROQ_KEY);
    const groqOk70b    = await testProvider('Groq (70b)',         'https://api.groq.com/openai/v1/chat/completions',      'llama-3.3-70b-versatile',                 GROQ_KEY);
    const sambaOk      = await testProvider('SambaNova',          'https://api.sambanova.ai/v1/chat/completions',          'Meta-Llama-3.1-8B-Instruct',              SAMBANOVA_KEY);
    const orOk         = await testProvider('OpenRouter',         'https://openrouter.ai/api/v1/chat/completions',         'mistralai/mistral-7b-instruct:free',       OPENROUTER_KEY);
    const geminiOk     = await testProvider('Gemini',             'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'gemini-2.0-flash', GEMINI_KEY);

    log('\n--- Summary ---');
    log('Groq 8b-instant:  ' + (groqOk    ? '✅ WORKING' : '❌ FAILED'));
    log('Groq 70b:         ' + (groqOk70b ? '✅ WORKING' : '❌ FAILED'));
    log('SambaNova:        ' + (sambaOk   ? '✅ WORKING' : '❌ FAILED'));
    log('OpenRouter:       ' + (orOk      ? '✅ WORKING' : '❌ FAILED'));
    log('Gemini:           ' + (geminiOk  ? '✅ WORKING' : '❌ FAILED'));

    // Pick best working model for primary
    const bestGroq = groqOk ? 'llama-3.1-8b-instant' : (groqOk70b ? 'llama-3.3-70b-versatile' : null);
    log('\nBest primary: ' + (bestGroq || 'Groq not available — using fallback'));

    // Reset MongoDB with correct values
    await resetMongo();

    log('\n✅ Done. Check ai-fix-result.log for details.');
    log('Now restart server: pm2 restart bas-serv');
}

main().catch(e => log('FATAL: ' + e.message));
