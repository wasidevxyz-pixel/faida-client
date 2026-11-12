const AiProvider = require('../models/AiProvider');
const AiProviderLog = require('../models/AiProviderLog');
const manager = require('../ai/provider/providerManager');

const editable = ['apiKey', 'baseUrl', 'model', 'timeoutMs', 'priority', 'enabled'];
const numeric = new Set(['timeoutMs', 'priority']);

function serialize(provider) {
  const value = manager.publicProvider(provider);
  const total = Number(value.totalRequests || 0);
  return { ...value, successRate: total ? Number((((total - Number(value.totalFailures || 0)) / total) * 100).toFixed(2)) : 0 };
}

exports.list = async (req, res, next) => {
  try { res.json({ success: true, data: (await manager.providers({ includeKey: true, force: true })).map(serialize) }); }
  catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const updates = {};
    for (const key of editable) {
      if (!(key in (req.body || {}))) continue;
      if (numeric.has(key)) { const value = Number(req.body[key]); if (!Number.isFinite(value)) return res.status(400).json({ success: false, message: `${key} must be a number.` }); updates[key] = value; }
      else if (key === 'enabled') { if (typeof req.body[key] !== 'boolean') return res.status(400).json({ success: false, message: 'enabled must be true or false.' }); updates[key] = req.body[key]; }
      else if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim();
    }
    if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: 'No valid provider settings were supplied.' });
    // Replacing a rejected credential is the administrator's explicit recovery
    // action; make the provider eligible again and let health checks verify it.
    if (updates.enabled === true || ('apiKey' in updates && updates.apiKey)) {
      updates.enabled = true;
      updates.healthStatus = 'unknown';
      updates.lastError = '';
    }
    const provider = await AiProvider.findByIdAndUpdate(req.params.id, { $set: updates }, { returnDocument: 'after', runValidators: true }).select('+apiKey').lean();
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found.' });
    manager.invalidate();
    res.json({ success: true, data: serialize(provider) });
  } catch (error) { next(error); }
};

exports.reorder = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.providerIds) ? req.body.providerIds : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'providerIds is required.' });
    const providers = await AiProvider.find({ _id: { $in: ids } }).select('_id').lean();
    if (providers.length !== ids.length) return res.status(400).json({ success: false, message: 'Provider list is invalid.' });
    await Promise.all(ids.map((id, index) => AiProvider.updateOne({ _id: id }, { $set: { priority: index + 1 } })));
    manager.invalidate();
    res.json({ success: true });
  } catch (error) { next(error); }
};

exports.checkHealth = async (req, res, next) => {
  try { await manager.healthCheck(); res.json({ success: true, message: 'Provider health check completed.' }); }
  catch (error) { next(error); }
};

exports.logs = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const logs = await AiProviderLog.find().sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ success: true, data: logs });
  } catch (error) { next(error); }
};
