const catalog = require('./moduleCatalog');
const cache = require('../cache/cacheManager');
const config = require('../config');
const { toolsForUser } = require('../../services/aiDataAgentService');

function moduleById(id) { return catalog.find(module => module.id === id) || catalog.find(module => module.id === 'general'); }
function routingManifest() { return cache.getOrSet('module-manifest', () => catalog.map(({ id, description, examples }) => ({ id, description, examples })), config.cacheTtlMs); }
function loadForUser(id, user) {
  const module = moduleById(id);
  const allowed = new Set(toolsForUser(user).map(tool => tool.function.name));
  return { ...module, tools: toolsForUser(user).filter(tool => module.tools.includes(tool.function.name) && allowed.has(tool.function.name)) };
}
module.exports = { routingManifest, loadForUser, moduleById };
