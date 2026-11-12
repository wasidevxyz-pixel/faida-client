const express = require('express');
const router = express.Router();

const {
  getProfitLossReport,
  getDetailedProfitLoss,
  exportProfitLossReport
} = require('../controllers/profitLossController');
const {
  getSalesReport,
  getTopSellingItems,
  getCustomerSalesAnalysis,
  exportSalesReport
} = require('../controllers/salesReportController');
const {
  getPurchaseReport,
  getTopPurchasedItems,
  getSupplierPurchaseAnalysis,
  exportPurchaseReport
} = require('../controllers/purchaseReportController');
const {
  getStockReport,
  getStockMovementReport,
  getItemStockReport,
  getLowStockAlert,
  exportStockReport
} = require('../controllers/stockReportController');
const {
  getCashBookReport,
  getCashBookPartySummary,
  getCashFlowAnalysis,
  exportCashBookReport
} = require('../controllers/cashBookController');
const {
  getBankBookReport,
  getBankBookBankSummary,
  getBankCashFlowAnalysis,
  exportBankBookReport
} = require('../controllers/bankBookController');
const {
  getLedgerReport,
  getTrialBalance,
  getBalanceSheet,
  getLedgerSummary,
  exportLedgerReport
} = require('../controllers/ledgerController');
const { getBankLedgerReport, getBranchBankBalance, getBranchBankBalances, getSummaryOpeningBalance } = require('../controllers/bankLedgerController');
const { getProBankSummary, getAllBankBalances } = require('../controllers/newBankSummaryController');
const { protect, accountsAccess } = require('../middleware/auth');

// New Professional Bank Summary
router
  .route('/bank-ledger/pro-summary')
  .get(protect, accountsAccess, getProBankSummary);

router
  .route('/bank-ledger/all-balances-pro')
  .get(protect, accountsAccess, getAllBankBalances);

// Bank Ledger Report
router
  .route('/bank-ledger')
  .get(protect, accountsAccess, getBankLedgerReport);

router
  .route('/bank-ledger/branch-balance')
  .get(protect, accountsAccess, getBranchBankBalance);

router
  .route('/bank-ledger/branch-bank-balances')
  .get(protect, accountsAccess, getBranchBankBalances);

router
  .route('/bank-ledger/summary-opening-balance')
  .get(protect, accountsAccess, getSummaryOpeningBalance);


// Profit & Loss Reports
router
  .route('/profit-loss')
  .get(protect, accountsAccess, getProfitLossReport);

router
  .route('/profit-loss/detailed')
  .get(protect, accountsAccess, getDetailedProfitLoss);

router
  .route('/profit-loss/export')
  .get(protect, accountsAccess, exportProfitLossReport);

// Sales Reports
router
  .route('/sales')
  .get(protect, accountsAccess, getSalesReport);

router
  .route('/sales/top-items')
  .get(protect, accountsAccess, getTopSellingItems);

router
  .route('/sales/customer-analysis')
  .get(protect, accountsAccess, getCustomerSalesAnalysis);

router
  .route('/sales/export')
  .get(protect, accountsAccess, exportSalesReport);

// Purchase Reports
router
  .route('/purchases')
  .get(protect, accountsAccess, getPurchaseReport);

router
  .route('/purchases/top-items')
  .get(protect, accountsAccess, getTopPurchasedItems);

router
  .route('/purchases/supplier-analysis')
  .get(protect, accountsAccess, getSupplierPurchaseAnalysis);

router
  .route('/purchases/export')
  .get(protect, accountsAccess, exportPurchaseReport);

// Stock Reports
router
  .route('/stock')
  .get(protect, accountsAccess, getStockReport);

router
  .route('/stock/movements')
  .get(protect, accountsAccess, getStockMovementReport);

router
  .route('/stock/items')
  .get(protect, accountsAccess, getItemStockReport);

router
  .route('/stock/low-stock')
  .get(protect, accountsAccess, getLowStockAlert);

router
  .route('/stock/export')
  .get(protect, accountsAccess, exportStockReport);

// Cash Book Reports
router
  .route('/cash-book')
  .get(protect, accountsAccess, getCashBookReport);

router
  .route('/cash-book/party-summary')
  .get(protect, accountsAccess, getCashBookPartySummary);

router
  .route('/cash-book/cash-flow')
  .get(protect, accountsAccess, getCashFlowAnalysis);

router
  .route('/cash-book/export')
  .get(protect, accountsAccess, exportCashBookReport);

// Bank Book Reports
router
  .route('/bank-book')
  .get(protect, accountsAccess, getBankBookReport);

router
  .route('/bank-book/bank-summary')
  .get(protect, accountsAccess, getBankBookBankSummary);

router
  .route('/bank-book/cash-flow')
  .get(protect, accountsAccess, getBankCashFlowAnalysis);

router
  .route('/bank-book/export')
  .get(protect, accountsAccess, exportBankBookReport);

// Ledger Reports
router
  .route('/ledger')
  .get(protect, accountsAccess, getLedgerReport);

router
  .route('/ledger/trial-balance')
  .get(protect, accountsAccess, getTrialBalance);

router
  .route('/ledger/balance-sheet')
  .get(protect, accountsAccess, getBalanceSheet);

router
  .route('/ledger/summary')
  .get(protect, accountsAccess, getLedgerSummary);

router
  .route('/ledger/export')
  .get(protect, accountsAccess, exportLedgerReport);

module.exports = router;
