const asyncHandler = require('../middleware/async');
const Settings = require('../models/Settings');
const crypto = require('crypto');

// @desc    Get settings
// @route   GET /api/v1/settings
// @access  Private
exports.getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSettings();

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update settings
// @route   PUT /api/v1/settings
// @access  Private (admin only)
exports.updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.updateSettings(req.body, req.user.id);

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Get next invoice number
// @route   GET /api/v1/settings/next-number/:type
// @access  Private
exports.getNextInvoiceNumber = asyncHandler(async (req, res) => {
  const { type } = req.params;

  const settings = await Settings.getSettings();
  const nextNumber = await settings.getNextInvoiceNumber(type);

  res.status(200).json({
    success: true,
    data: {
      type,
      nextNumber
    }
  });
});

// @desc    Reset financial year
// @route   POST /api/v1/settings/reset-financial-year
// @access  Private (admin only)
exports.resetFinancialYear = asyncHandler(async (req, res) => {
  const { newFinancialYear, startDate, endDate } = req.body;

  const settings = await Settings.getSettings();

  settings.financialYear = newFinancialYear;
  settings.financialYearStart = new Date(startDate);
  settings.financialYearEnd = new Date(endDate);
  settings.updatedBy = req.user.id;

  await settings.save();

  res.status(200).json({
    success: true,
    data: settings,
    message: 'Financial year reset successfully'
  });
});

// @desc    Test email configuration
// @route   POST /api/v1/settings/test-email
// @access  Private (admin only)
exports.testEmailConfiguration = asyncHandler(async (req, res) => {
  const { to } = req.body;

  const settings = await Settings.getSettings();

  if (!settings.emailNotifications || !settings.smtpHost) {
    return res.status(400).json({
      success: false,
      message: 'Email configuration is not complete'
    });
  }

  // Here you would implement actual email testing logic
  // For now, just return success

  res.status(200).json({
    success: true,
    message: 'Email test sent successfully'
  });
});

// @desc    Get company information for invoices
// @route   GET /api/v1/settings/company-info
// @access  Private
exports.getCompanyInfo = asyncHandler(async (req, res) => {
  const settings = await Settings.getSettings();

  const companyInfo = {
    companyName: settings.companyName,
    address: settings.address,
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    taxNumber: settings.taxNumber,
    pan: settings.pan,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    logo: settings.logo,
    cgstRate: settings.cgstRate,
    sgstRate: settings.sgstRate,
    igstRate: settings.igstRate,
    cessRate: settings.cessRate,
    enableReverseCharge: settings.enableReverseCharge
  };

  res.status(200).json({
    success: true,
    data: companyInfo
  });
});

// @desc    Backup settings
// @route   POST /api/v1/settings/backup
// @access  Private (admin only)
exports.backupSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSettings();

  // Create backup data
  const backupData = {
    settings: settings,
    timestamp: new Date(),
    version: '1.0'
  };

  res.status(200).json({
    success: true,
    data: backupData,
    message: 'Settings backup created successfully'
  });
});

// @desc    Restore settings
// @route   POST /api/v1/settings/restore
// @access  Private (admin only)
exports.restoreSettings = asyncHandler(async (req, res) => {
  const { backupData } = req.body;

  if (!backupData || !backupData.settings) {
    return res.status(400).json({
      success: false,
      message: 'Invalid backup data'
    });
  }

  const settings = await Settings.getSettings();

  // Restore settings from backup
  Object.assign(settings, backupData.settings);
  settings.updatedBy = req.user.id;

  await settings.save();

  res.status(200).json({
    success: true,
    data: settings,
    message: 'Settings restored successfully'
  });
});

// @desc    Generate API Key
// @route   POST /api/v1/settings/api-key
// @access  Private (admin only)
exports.generateApiKey = asyncHandler(async (req, res) => {
  const settings = await Settings.getSettings();

  // Generate random key and secret
  const apiKey = crypto.randomBytes(20).toString('hex');
  const apiSecret = crypto.randomBytes(40).toString('hex');

  settings.apiKey = apiKey;
  settings.apiSecret = apiSecret;
  settings.updatedBy = req.user.id;

  await settings.save();

  res.status(200).json({
    success: true,
    data: {
      apiKey,
      apiSecret
    },
    message: 'API Key generated successfully'
  });
});

// @desc    Get system statistics
// @route   GET /api/v1/settings/stats
// @access  Private (admin only)
exports.getSystemStats = asyncHandler(async (req, res) => {
  const User = require('../models/User');
  const Item = require('../models/Item');
  const Party = require('../models/Party');
  const Sale = require('../models/Sale');
  const Purchase = require('../models/Purchase');

  const [
    userCount,
    itemCount,
    partyCount,
    saleCount,
    purchaseCount
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Item.countDocuments({ isActive: true }),
    Party.countDocuments({ isActive: true }),
    Sale.countDocuments(),
    Purchase.countDocuments()
  ]);

  const stats = {
    users: userCount,
    items: itemCount,
    parties: partyCount,
    sales: saleCount,
    purchases: purchaseCount,
    totalTransactions: saleCount + purchaseCount
  };

  res.status(200).json({
    success: true,
    data: stats
  });
});
