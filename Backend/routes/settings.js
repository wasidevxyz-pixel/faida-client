const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  getNextInvoiceNumber,
  resetFinancialYear,
  testEmailConfiguration,
  getCompanyInfo,
  backupSettings,
  restoreSettings,
  getSystemStats,
  generateApiKey
} = require('../controllers/settingsController');
const { protect, adminAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getSettings)
  .put(protect, adminAccess, updateSettings);

router
  .route('/next-number/:type')
  .get(protect, getNextInvoiceNumber);

router
  .route('/reset-financial-year')
  .post(protect, adminAccess, resetFinancialYear);

router
  .route('/test-email')
  .post(protect, adminAccess, testEmailConfiguration);

router
  .route('/company-info')
  .get(protect, getCompanyInfo);

router
  .route('/backup')
  .post(protect, adminAccess, backupSettings);

router
  .route('/restore')
  .post(protect, adminAccess, restoreSettings);


router
  .route('/api-key')
  .post(protect, adminAccess, generateApiKey);

router
  .route('/stats')
  .get(protect, adminAccess, getSystemStats);

module.exports = router;
