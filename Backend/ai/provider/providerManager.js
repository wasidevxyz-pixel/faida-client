'use strict';

const crypto = require('crypto');
const AiProvider = require('../../models/AiProvider');
const AiProviderLog = require('../../models/AiProviderLog');
const cache = require('../cache/cacheManager');

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS        = 15 * 60 * 1000;   // Cache AI completions for 15 min
const PROVIDER_CACHE_MS   = 5_000;             // In-memory provider list TTL
const HEALTH_INTERVAL_MS  = 60 * 1000;         // Background health check interval
const OFFLINE_COOLDOWN_MS = 20 * 1000;         // Skip offline providers for only 20s (was 90s)
const ALL_FAILED_MESSAGE  = 'AI service is temporarily busy. Please try again shortly.';

// ─── Provider definitions ─────────────────────────────────────────────────────
// columns: [ name, displayName, baseUrl, defaultModel, API_KEY_ENV, MODEL_ENV ]
// apiKey and model are auto-synced from .env on every server restart.
// To add/update: edit .env then run: pm2 restart bas-serv
const ENV_MAP = [
  ['groq',                  'Groq',                  'https://api.groq.com/openai/v1',                         'llama-3.3-70b-versatile',                          'GROQ_API_KEY',        'GROQ_MODEL'],
  ['openrouter',            'OpenRouter',             'https://openrouter.ai/api/v1',                           'mistralai/mistral-7b-instruct:free',                'OPENROUTER_API_KEY',  'OPENROUTER_MODEL'],
  ['gemini',                'Gemini',                 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.0-flash',                                 'GEMINI_API_KEY',      'GEMINI_MODEL'],
  ['sambanova',             'SambaNova',              'https://api.sambanova.ai/v1',                            'Meta-Llama-3.3-70B-Instruct',                      'SAMBANOVA_API_KEY',   'SAMBANOVA_MODEL'],
  ['together_ai',           'Together AI',            'https://api.together.xyz/v1',                            'meta-llama/Llama-3.3-70B-Instruct-Turbo',          'TOGETHER_API_KEY',    'TOGETHER_MODEL'],
  ['deepinfra',             'DeepInfra',              'https://api.deepinfra.com/v1/openai',                    'meta-llama/Llama-3.3-70B-Instruct-Turbo',          'DEEPINFRA_API_KEY',   'DEEPINFRA_MODEL'],
  ['cerebras',              'Cerebras',               'https://api.cerebras.ai/v1',                             'llama-3.3-70b',                                    'CEREBRAS_API_KEY',    'CEREBRAS_MODEL'],
  ['fireworks_ai',          'Fireworks AI',           'https://api.fireworks.ai/inference/v1',                  'accounts/fireworks/models/llama-v3p3-70b-instruct', 'FIREWORKS_API_KEY',   'FIREWORKS_MODEL'],
  ['novita_ai',             'Novita AI',              'https://api.novita.ai/v3/openai',                        'meta-llama/llama-3.3-70b-instruct',                'NOVITA_API_KEY',      'NOVITA_MODEL'],
  ['github_models',         'GitHub Models',          'https://models.inference.ai.azure.com',                  'gpt-4o-mini',                                      'GITHUB_MODELS_KEY',   'GITHUB_MODELS_MODEL'],
  ['hugging_face',          'Hugging Face',           'https://router.huggingface.co/v1',                       'meta-llama/Llama-3.3-70B-Instruct',                'HUGGINGFACE_API_KEY', 'HUGGINGFACE_MODEL'],
  ['cloudflare_workers_ai', 'Cloudflare Workers AI',  '',                                                        '',                                                 'CLOUDFLARE_API_KEY',  'CLOUDFLARE_MODEL'],
  ['ollama',                'Local Ollama',           'http://127.0.0.1:11434/v1',                              'llama3.2',                                         '',                    'OLLAMA_MODEL'],
];

// ─── In-process state ─────────────────────────────────────────────────────────
let providersCache;
let providersCacheAt = 0;
let healthTimer;

// Circuit breaker: tracks the timestamp when each offline provider can be
// retried again. Key = provider name, Value = Date.now() + OFFLINE_COOLDOWN_MS
const offlineCooldown = new Map();

const invalidate = () => { providersCache = undefined; providersCacheAt = 0; };

// ─── ensureDefaults ───────────────────────────────────────────────────────────
// Runs on every server start. Reads .env and upserts each provider into MongoDB.
// No manual import script needed — just update .env and: pm2 restart bas-serv
async function ensureDefaults() {
  await Promise.all(ENV_MAP.map(([name, displayName, baseUrl, defaultModel, keyEnv, modelEnv], index) => {
    const apiKey = keyEnv   ? String(process.env[keyEnv]   || '').trim() : '';
    const model  = modelEnv ? String(process.env[modelEnv] || '').trim() || defaultModel : defaultModel;
    const hasKey = apiKey.length > 0 || name === 'ollama';

    // $setOnInsert: ONLY immutable identity fields that will NEVER appear in $set.
    // MongoDB error code 40 fires if the same path exists in both operators.
    const setOnInsert = { name, displayName, priority: index + 1 };

    // $set: ALL mutable fields — runs on every insert AND update so .env is
    // always synced into MongoDB on each server restart. No path overlap with
    // $setOnInsert above.
    const setAlways = {
      model,
      enabled:      hasKey,
      ...(baseUrl   ? { baseUrl }                                                              : {}),
      // Always re-enable and clear errors on restart if key is present
      // This prevents a stale 'disabled' status from blocking the provider permanently
      ...(hasKey    ? { apiKey, healthStatus: 'unknown', lastError: '', totalFailures: 0 }    : {})
    };

    return AiProvider.updateOne(
      { name },
      { $setOnInsert: setOnInsert, $set: setAlways },
      { upsert: true }
    );
  }));
}

// ─── providers ────────────────────────────────────────────────────────────────
async function providers({ includeKey = true, force = false } = {}) {
  if (!force && providersCache && Date.now() - providersCacheAt < PROVIDER_CACHE_MS) {
    return providersCache;
  }
  await ensureDefaults();
  let query = AiProvider.find().sort({ priority: 1, _id: 1 });
  if (includeKey) query = query.select('+apiKey');
  providersCache  = await query.lean();
  providersCacheAt = Date.now();
  return providersCache;
}

// ─── errorInfo ────────────────────────────────────────────────────────────────
function errorInfo(error) {
  const status     = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const message    = String(error?.message || 'Provider request failed');
  const timeout    = error?.name === 'AbortError' || /timeout|timed out|aborted/i.test(message);
  // Only treat 401/403 with explicit auth error messages as invalid key — never 503
  const invalidKey = (status === 401 || status === 403)
    && /invalid.*(api )?key|unauthorized api key|authentication failed/i.test(message);
  const rateLimited = status === 429 || /quota|rate.?limit/i.test(message);
  const retryable  = timeout || rateLimited || [500, 502, 503, 529].includes(status)
    || /network|fetch failed|econnreset|enotfound|service unavailable|overloaded/i.test(message);
  return { status, message: message.slice(0, 1000), timeout, invalidKey, rateLimited, retryable };
}

// ─── optimizeMessages ─────────────────────────────────────────────────────────
// Trims long histories to stay within context limits without losing relevance.
function optimizeMessages(messages = []) {
  if (messages.length <= 10) return messages;
  const system    = messages.filter(m => m.role === 'system').slice(0, 1);
  const nonSystem = messages.filter(m => m.role !== 'system');
  const latestWords = String(nonSystem.at(-1)?.content || '')
    .toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const recent   = nonSystem.slice(-6);
  const relevant = nonSystem.slice(0, -6)
    .map(m => ({ m, score: latestWords.reduce((n, w) => n + (String(m.content || '').toLowerCase().includes(w) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(item => item.m);
  return [...system, ...relevant, ...recent]
    .map(m => ({ ...m, content: typeof m.content === 'string' ? m.content.slice(-6000) : m.content }));
}

// ─── callProvider ─────────────────────────────────────────────────────────────
async function callProvider(provider, payload) {
  if (!provider.baseUrl || !provider.model || (!provider.apiKey && provider.name !== 'ollama')) {
    const err = new Error(`Provider "${provider.name}" is not configured (missing key, baseUrl, or model)`);
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs || 25_000);

  try {
    const response = await new Promise((resolve, reject) => {
      fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
        },
        body: JSON.stringify({
          ...payload,
          messages: optimizeMessages(payload.messages),
          model: provider.model
        })
      }).then(resolve).catch(reject);
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 900);
      const err    = new Error(`${provider.displayName || provider.name} responded ${response.status}: ${detail}`);
      err.status   = response.status;
      throw err;
    }

    const body    = await response.json();
    const message = body?.choices?.[0]?.message;
    if (!message) throw new Error(`${provider.displayName || provider.name} returned no completion`);
    return { message, usage: body.usage || {} };

  } finally {
    clearTimeout(timer);
  }
}

// ─── log ──────────────────────────────────────────────────────────────────────
async function log(provider, started, usage = {}, errorMsg = '') {
  const responseTimeMs     = Date.now() - started;
  const promptTokens       = Number(usage.prompt_tokens || 0);
  const completionTokens   = Number(usage.completion_tokens || 0);

  await AiProviderLog.create({
    provider: provider.name, model: provider.model,
    responseTimeMs, promptTokens, completionTokens,
    totalTokens: Number(usage.total_tokens || promptTokens + completionTokens),
    cost: 0, error: errorMsg
  });

  const prev   = await AiProvider.findById(provider._id).select('totalRequests averageResponseTimeMs').lean();
  const total  = Number(prev?.totalRequests || 0);
  const newAvg = Math.round((Number(prev?.averageResponseTimeMs || 0) * total + responseTimeMs) / (total + 1));

  await AiProvider.updateOne({ _id: provider._id }, {
    $inc: { totalRequests: 1, ...(errorMsg ? { totalFailures: 1 } : {}) },
    $set: { averageResponseTimeMs: newAvg, lastError: errorMsg, healthStatus: errorMsg ? 'offline' : 'online' }
  });
}

// ─── complete ─────────────────────────────────────────────────────────────────
// Tries providers in priority order with circuit-breaker cooldown for offline
// providers and a single retry on rate-limit / timeout before moving on.
async function complete(payload) {
  // Return cached response for identical payloads
  const cacheKey = `ai:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const chain = (await providers()).filter(p => p.enabled && p.healthStatus !== 'disabled');

  const errors = []; // Collect per-provider failures for diagnostic logging

  for (const provider of chain) {
    // ── Circuit breaker: skip providers that are cooling down ──────────────
    const coolUntil = offlineCooldown.get(provider.name);
    if (coolUntil && Date.now() < coolUntil) {
      errors.push(`[${provider.name}] skipped (circuit open for ${Math.ceil((coolUntil - Date.now()) / 1000)}s)`);
      continue;
    }

    let retried = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const started = Date.now();
      try {
        const result = await callProvider(provider, payload);
        await log(provider, started, result.usage);
        offlineCooldown.delete(provider.name); // Reset circuit on success
        invalidate();
        cache.set(cacheKey, result.message, CACHE_TTL_MS);
        return result.message;

      } catch (error) {
        const info = errorInfo(error);
        await log(provider, started, {}, info.message);
        console.warn(`[AI] ${provider.name} failed: ${info.message}`);
        errors.push(`[${provider.name}] ${info.message}`);

        if (info.invalidKey) {
          // Bad key — permanently disable until admin fixes it
          // NOTE: 503 is NOT an invalid key — never disable on 503
          await AiProvider.updateOne({ _id: provider._id }, {
            $set: { enabled: false, healthStatus: 'disabled', lastError: info.message }
          });
          console.error(`[AI] ${provider.name} disabled — invalid API key`);
          break;
        }

        if (!retried && (info.rateLimited || info.timeout)) {
          retried = true;
          await AiProvider.updateOne({ _id: provider._id }, { $inc: { retryCount: 1 } });
          // On rate limit — don't retry the same provider, move to next immediately.
          // Retrying a rate-limited provider wastes a request and adds delay.
          if (info.rateLimited) {
            offlineCooldown.set(provider.name, Date.now() + OFFLINE_COOLDOWN_MS);
            invalidate();
            break; // Skip to next provider immediately
          }
          continue; // Only retry on timeout, not rate limit
        }

        // Open circuit breaker — skip this provider for OFFLINE_COOLDOWN_MS
        offlineCooldown.set(provider.name, Date.now() + OFFLINE_COOLDOWN_MS);
        invalidate();
        break;
      }
    }
  }

  // All providers exhausted
  console.error(`[AI] All providers failed:\n${errors.map(e => `  • ${e}`).join('\n')}`);
  const err      = new Error(ALL_FAILED_MESSAGE);
  err.statusCode = 503;
  err.safeMessage = ALL_FAILED_MESSAGE;
  err.providerErrors = errors; // Available for diagnostics endpoint
  throw err;
}

// ─── healthCheck ──────────────────────────────────────────────────────────────
async function healthCheck() {
  const all = await providers({ force: true });
  await Promise.all(all.map(async provider => {
    if (!provider.enabled || !provider.baseUrl || (!provider.apiKey && provider.name !== 'ollama')) return;
    const started = Date.now();
    try {
      await callProvider(provider, { messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0 });
      await AiProvider.updateOne({ _id: provider._id }, {
        $set: { healthStatus: 'online', lastError: '', lastHealthCheckAt: new Date() }
      });
      offlineCooldown.delete(provider.name); // Clear circuit on healthy ping
    } catch (error) {
      const info = errorInfo(error);
      await AiProvider.updateOne({ _id: provider._id }, {
        $set: {
          healthStatus: info.invalidKey ? 'disabled' : 'offline',
          lastError: info.message,
          lastHealthCheckAt: new Date(),
          ...(info.invalidKey ? { enabled: false } : {})
        }
      });
      if (!info.invalidKey) {
        offlineCooldown.set(provider.name, Date.now() + OFFLINE_COOLDOWN_MS);
      }
    } finally {
      void started;
    }
  }));
  invalidate();
}

// ─── startHealthChecks ────────────────────────────────────────────────────────
function startHealthChecks() {
  if (!healthTimer) {
    healthTimer = setInterval(
      () => healthCheck().catch(err => console.error('[AI] health check error:', err.message)),
      HEALTH_INTERVAL_MS
    );
    healthTimer.unref?.();
  }
}

// ─── publicProvider ───────────────────────────────────────────────────────────
function publicProvider(provider) {
  const { apiKey, ...safe } = provider; // Never expose the key
  return {
    ...safe,
    hasApiKey: Boolean(apiKey),
    circuitOpen: offlineCooldown.has(provider.name) && Date.now() < (offlineCooldown.get(provider.name) || 0)
  };
}

module.exports = {
  complete,
  providers,
  ensureDefaults,
  invalidate,
  healthCheck,
  startHealthChecks,
  publicProvider,
  ALL_FAILED_MESSAGE
};
