const AuditLog = require('../models/AuditLog');
const AiPreference = require('../models/AiPreference');
const { getSummary } = require('../services/aiBusinessSummaryService');
const { allowedActionsFor, allowedMetricsFor, canUseAction, findAction, findMetric, publicAction, rightsFor } = require('../config/aiActionCatalog');
const { allowedReportsFor, publicReport } = require('../config/aiReportRegistry');
const { chatWithDataAgent, toolsForUser } = require('../services/aiDataAgentService');
const { chatWithModularBrain } = require('../ai/brain/modularBrain');
const aiConfig = require('../ai/config');
const { ALL_FAILED_MESSAGE } = require('../ai/provider/providerManager');
const WHItem = require('../models/WHItem');
const WHItemCategory = require('../models/WHItemCategory');
const ClosingSheet = require('../models/ClosingSheet');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const MAX_MESSAGE_LENGTH = 2_000;

function hideInternalAiTerms(answer) {
  return typeof answer === 'string'
    ? answer.replace(/\bprintsummary\b/gi, 'UG commission details')
    : answer;
}
function sanitizeAction(action) {
  const catalogAction = findAction(action);
  if (!catalogAction) {
    return null;
  }
  const params = action.params && typeof action.params === 'object'
    ? Object.fromEntries(Object.entries(action.params).filter(([key, value]) =>
      ['startDate', 'endDate'].includes(key) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))))
    : undefined;
  return { ...publicAction(catalogAction), params };
}

async function resolveReadOnlyAction(req, action, data) {
  if (action?.type !== 'business_summary' || !['today_sales', 'today_purchases'].includes(action.metric)) {
    return sanitizeAction(action);
  }
  const metric = findMetric(action.metric);
  if (!metric || !canUseAction(req.user, metric)) {
    data.answer = 'You do not have permission to view that ERP summary.';
    data._policyDenied = true;
    return null;
  }
  const summary = await getSummary(req, action.metric);
  data.answer = summary.answer;
  data.summary = { metric: summary.metric, total: summary.total, count: summary.count };
  return null;
}

function userContext(user) {
  return {
    id: String(user._id),
    name: user.name || user.email || 'ERP User',
    role: user.role,
    branches: Array.isArray(user.branch) ? user.branch : (user.branch ? [user.branch] : []),
    rights: [...rightsFor(user)]
  };
}

exports.health = async (req, res) => {
  const { providers } = require('../ai/provider/providerManager');
  const configuredProviders = (await providers({ includeKey: true, force: true })).filter(provider => provider.enabled && provider.baseUrl && provider.model && (provider.apiKey || provider.name === 'ollama'));
  const configured = configuredProviders.length > 0;
  res.status(configured ? 200 : 503).json({
    success: configured,
    data: { provider: configuredProviders[0]?.name || null, configured, model: configuredProviders[0]?.model || null, mode: aiConfig.mode, readOnly: true }
  });
};

exports.capabilities = async (req, res) => {
  res.json({ success: true, data: { readOnly: true, provider: 'groq', actions: allowedActionsFor(req.user).map(publicAction), metrics: allowedMetricsFor(req.user).map(metric => metric.id), reports: allowedReportsFor(req.user, canUseAction).map(publicReport), tools: toolsForUser(req.user).map(tool => tool.function.name) } });
};

exports.chat = async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.slice(0, 100) : undefined;

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` });
  }

  try {
    const data = await (aiConfig.mode === 'legacy'
      ? chatWithDataAgent(req, message, conversationId)
      : chatWithModularBrain(req, message, conversationId));
    // Tool-result property names are implementation details, never user-facing
    // assistant language. Apply this guard for both AI modes.
    data.answer = hideInternalAiTerms(data.answer);
    // Never let a model-provided field influence a security audit outcome.
    data._policyDenied = false;
    const suggestedAction = data.action;
    data.action = await resolveReadOnlyAction(req, suggestedAction, data);
    if (suggestedAction && !data.action && suggestedAction.type !== 'business_summary') {
      data.answer = 'That ERP action is not available through D.WATSON.';
      data._policyDenied = true;
    }
    const requestedAction = data.action;
    if (requestedAction && !canUseAction(req.user, findAction(requestedAction))) {
      data.action = null;
      data.answer = 'You do not have permission to use that ERP screen or report.';
      data._policyDenied = true;
    }

    // Record the operation, never the full prompt or model response.
    AuditLog.log({
      action: 'other',
      entity: 'other',
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      changes: {
        source: 'ai_brain',
        messageLength: message.length,
        action: data.action?.id || 'answer',
        requestedAction: requestedAction?.id || null,
        outcome: data._policyDenied ? 'denied' : 'success'
      },
      status: data._policyDenied ? 'failed' : 'success'
    });

    delete data._policyDenied;
    res.json({ success: true, data });
  } catch (error) {
    // Log the real failure internally so it is visible in pm2 logs / server console.
    const detail = error?.providerErrors?.length
      ? `\n${error.providerErrors.map(e => `  • ${e}`).join('\n')}`
      : (error?.message || 'unknown error');
    console.error(`[AI CHAT] request failed for user ${req.user?._id}: ${detail}`);

    // Expose error detail only in development; keep it generic in production.
    const clientMessage = error?.safeMessage || ALL_FAILED_MESSAGE;
    const extra = process.env.NODE_ENV !== 'production' && error?.providerErrors
      ? { providerErrors: error.providerErrors }
      : {};
    res.status(error.statusCode || 503).json({ success: false, message: clientMessage, ...extra });
  }
};

// The stock-in-hand report can contain thousands of rows. Generate it on the
// server as a PDF instead of passing its contents through an AI model.
exports.downloadWarehouseStockInHandPdf = async (req, res) => {
  const stockAction = findAction({ id: 'stock_position_report.open' });
  if (!stockAction || !canUseAction(req.user, stockAction)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to download the stock-in-hand report.' });
  }

  const allowedCategories = Array.isArray(req.user?.allowedWHItemCategories)
    ? req.user.allowedWHItemCategories.filter(Boolean)
    : [];
  const query = { isActive: { $ne: false } };
  if (allowedCategories.length) query.category = { $in: allowedCategories };
  const requestedCategory = String(req.query.category || '').trim();
  let reportTitle = 'Warehouse Stock In Hand — Category-wise';
  if (requestedCategory) {
    const escaped = requestedCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const categoryQuery = { name: new RegExp(escaped, 'i'), isActive: { $ne: false } };
    if (allowedCategories.length) categoryQuery._id = { $in: allowedCategories };
    const matches = await WHItemCategory.find(categoryQuery).select('_id name').sort({ name: 1 }).limit(2).lean();
    if (!matches.length) return res.status(404).json({ success: false, message: `No authorized warehouse category matches "${requestedCategory}".` });
    if (matches.length > 1) return res.status(400).json({ success: false, message: `More than one warehouse category matches "${requestedCategory}". Please use the full category name.` });
    query.category = matches[0]._id;
    reportTitle = `Warehouse Stock In Hand — ${matches[0].name}`;
  }

  const items = await WHItem.find(query)
    .populate('category', 'name')
    .select('itemsCode barcode name category costPrice stock')
    .sort({ name: 1 })
    .lean();
  const groups = new Map();
  for (const item of items) {
    const category = item.category?.name || 'Uncategorized';
    const row = {
      code: item.barcode || item.itemsCode || '-',
      name: item.name || '-',
      stock: (item.stock || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
      cost: Number(item.costPrice || 0)
    };
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(row);
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  let page;
  let y;
  let pageNumber = 0;
  const drawText = (text, x, yPos, size, font = regular, color = rgb(0, 0, 0)) => page.drawText(String(text), { x, y: yPos, size, font, color });
  const addPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
    drawText('BILAL ACCOUNTING SOFTWARE', margin, y, 15, bold, rgb(0.12, 0.3, 0.55));
    drawText(reportTitle, margin, y - 18, 11, bold);
    drawText(`Generated: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`, pageWidth - 245, y - 18, 8);
    y -= 38;
  };
  const ensureSpace = height => { if (y - height < margin + 14) addPage(); };
  const drawTableHeader = () => {
    ensureSpace(19);
    page.drawRectangle({ x: margin, y: y - 15, width: pageWidth - margin * 2, height: 15, color: rgb(0.92, 0.94, 0.97) });
    drawText('Code', margin + 4, y - 11, 8, bold);
    drawText('Item Name', margin + 115, y - 11, 8, bold);
    drawText('Stock', pageWidth - 220, y - 11, 8, bold);
    drawText('Cost', pageWidth - 145, y - 11, 8, bold);
    drawText('Value', pageWidth - 76, y - 11, 8, bold);
    y -= 18;
  };

  addPage();
  let totalQuantity = 0;
  let totalValue = 0;
  for (const [category, categoryItems] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    ensureSpace(34);
    page.drawRectangle({ x: margin, y: y - 15, width: pageWidth - margin * 2, height: 16, color: rgb(0.12, 0.3, 0.55) });
    drawText(category, margin + 5, y - 11, 9, bold, rgb(1, 1, 1));
    y -= 19;
    drawTableHeader();
    let categoryQuantity = 0;
    let categoryValue = 0;
    for (const row of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
      ensureSpace(15);
      const value = row.stock * row.cost;
      drawText(row.code.slice(0, 20), margin + 4, y - 10, 7);
      drawText(row.name.slice(0, 55), margin + 115, y - 10, 7);
      drawText(row.stock.toLocaleString(), pageWidth - 220, y - 10, 7);
      drawText(row.cost.toLocaleString(), pageWidth - 145, y - 10, 7);
      drawText(Math.round(value).toLocaleString(), pageWidth - 76, y - 10, 7);
      y -= 14;
      categoryQuantity += row.stock;
      categoryValue += value;
    }
    ensureSpace(18);
    drawText(`${category} total: Qty ${categoryQuantity.toLocaleString()}  •  Value ${Math.round(categoryValue).toLocaleString()} PKR`, margin + 4, y - 10, 8, bold);
    y -= 20;
    totalQuantity += categoryQuantity;
    totalValue += categoryValue;
  }
  ensureSpace(22);
  page.drawRectangle({ x: margin, y: y - 17, width: pageWidth - margin * 2, height: 18, color: rgb(0.92, 0.94, 0.97) });
  drawText(`GRAND TOTAL: Qty ${totalQuantity.toLocaleString()}  •  Value ${Math.round(totalValue).toLocaleString()} PKR`, margin + 5, y - 12, 9, bold);
  for (let index = 0; index < document.getPageCount(); index += 1) {
    const currentPage = document.getPages()[index];
    currentPage.drawText(`Page ${index + 1} of ${document.getPageCount()}`, { x: pageWidth - 90, y: 14, size: 7, font: regular, color: rgb(0.35, 0.35, 0.35) });
  }
  const bytes = await document.save();
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="warehouse-stock-in-hand-category-wise.pdf"',
    'Content-Length': bytes.length
  });
  return res.send(Buffer.from(bytes));
};

exports.getPreferences = async (req, res) => {
  const preference = await AiPreference.findOne({ user: req.user._id }).lean();
  res.json({
    success: true,
    data: preference || { voiceReplies: false, theme: 'system', language: 'en-US' }
  });
};

exports.updatePreferences = async (req, res) => {
  const updates = {};
  if (typeof req.body?.voiceReplies === 'boolean') updates.voiceReplies = req.body.voiceReplies;
  if (['system', 'light', 'dark'].includes(req.body?.theme)) updates.theme = req.body.theme;
  if (typeof req.body?.language === 'string' && /^[a-z]{2,3}-[A-Z]{2}$/.test(req.body.language)) {
    updates.language = req.body.language;
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: 'No valid AI preference was provided.' });
  }
  const preference = await AiPreference.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates, $setOnInsert: { user: req.user._id } },
    { returnDocument: 'after', upsert: true, runValidators: true }
  ).lean();
  AuditLog.log({
    action: 'update', entity: 'other', performedBy: req.user._id,
    ipAddress: req.ip, userAgent: req.get('user-agent'),
    changes: { source: 'ai_brain', preferenceKeys: Object.keys(updates) }
  });
  res.json({ success: true, data: preference });
};
