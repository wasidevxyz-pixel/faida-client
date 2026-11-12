const { moduleById } = require('../modules/moduleLoader');
const { event } = require('../logger/aiLogger');
const cache = require('../cache/cacheManager');
const config = require('../config');

function moduleForMessage(message) {
  const text = String(message || '').toLowerCase();
  const match = (words) => words.some(word => text.includes(word));
  // Include common Roman Urdu terms and spellings so the correct ERP tools are
  // available even when the user writes conversational Urdu-English text.
  if (match(['employee', 'employees', 'staff', 'emp', 'salary', 'tankhwa', 'tankhwaah', 'payroll', 'advance', 'adv ', 'qarz', 'loan', 'attendance', 'hazri', 'hazry', 'absent', 'ghair hazir', 'gair hazir', 'leave ', 'chutti', 'chhuti', 'designation', 'commission', 'commision', 'commssion', 'commision', 'under garment', 'under garments']) || /\b(?:ug|u\.g\.)\b/.test(text)) return 'hr';
  if (match(['bank', 'cheque', 'cheq', 'chq', 'cash batch', 'deposit', 'withdrawal', 'jama', 'nikalwa', 'nikalna'])) return 'banking';
  if (match(['stock', 'inventory', 'item ', 'purchase', 'kharid', 'khareed', 'warehouse', 'maal', 'samaan', 'saman', 'last purchase'])) return 'inventory';
  if (match(['customer', 'party ledger', 'customer ledger', 'customer balance', 'party ka hisab', 'customer ka hisab'])) return 'customers';
  if (match(['sale', 'sales', 'closing sheet', 'payment report', 'bikri', 'sale ki', 'farokht', 'farokht'])) return 'sales';
  return 'general';
}

async function selectModule(message) {
  const key = `module:${String(message).trim().toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // Route locally first.  This keeps greetings and clear ERP requests out of
  // the provider's tool-call parser, avoiding a provider error before any
  // authorized ERP tool has been selected.
  const localModule = moduleById(moduleForMessage(message));
  cache.set(key, localModule, config.cacheTtlMs);
  event('module_selected', { module: localModule.id, source: 'local' });
  return localModule;

}
module.exports = { selectModule };
