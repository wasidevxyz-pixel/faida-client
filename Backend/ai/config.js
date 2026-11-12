const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const parseList = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
const fallbackProviders = parseList(process.env.AI_FALLBACK_PROVIDERS || process.env.AI_FALLBACK_PROVIDER).map(item => item.toLowerCase());
const fallbackModels = parseList(process.env.AI_FALLBACK_MODELS || process.env.AI_FALLBACK_MODEL);

module.exports = Object.freeze({
  mode: (process.env.AI_BRAIN_MODE || 'modular').toLowerCase(),
  provider,
  model: process.env.AI_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  fallbackProviders,
  fallbackModels,
  // Kept for backward compatibility with installations that use one fallback.
  fallbackProvider: (process.env.AI_FALLBACK_PROVIDER || '').toLowerCase(),
  fallbackModel: process.env.AI_FALLBACK_MODEL || '',
  fallbackCooldownMs: Number(process.env.AI_FALLBACK_COOLDOWN_MS || 180_000),
  routerModel: process.env.AI_ROUTER_MODEL || process.env.AI_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 25_000),
  retries: Number(process.env.AI_RETRIES || 2),
  maxToolRounds: Number(process.env.AI_MAX_TOOL_ROUNDS || 3),
  historyTurns: Number(process.env.AI_MEMORY_TURNS || 3),
  cacheTtlMs: Number(process.env.AI_CACHE_TTL_MS || 300_000),
  openAiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
  vllmBaseUrl: process.env.VLLM_BASE_URL || 'http://127.0.0.1:8000/v1'
});
