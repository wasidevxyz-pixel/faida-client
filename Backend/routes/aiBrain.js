const express = require('express');
const { protect, adminAccess } = require('../middleware/auth');
const { aiLimiter, requireAiAccess } = require('../middleware/aiRateLimit');
const { chat, capabilities, health, getPreferences, updatePreferences, downloadWarehouseStockInHandPdf } = require('../controllers/aiBrainController');
const providerSettings = require('../controllers/aiProviderController');

const router = express.Router();

// The AI Brain is always called in the context of a signed-in ERP user.
router.use(protect);
router.use(requireAiAccess);
router.use(aiLimiter);
router.get('/health', health);
router.get('/capabilities', capabilities);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.get('/reports/wh-stock-in-hand.pdf', downloadWarehouseStockInHandPdf);
router.post('/chat', chat);

// Provider configuration is deliberately isolated from normal AI usage.
router.get('/providers', adminAccess, providerSettings.list);
router.put('/providers/:id', adminAccess, providerSettings.update);
router.put('/providers-priority', adminAccess, providerSettings.reorder);
router.post('/providers/health-check', adminAccess, providerSettings.checkHealth);
router.get('/providers/logs', adminAccess, providerSettings.logs);

module.exports = router;
