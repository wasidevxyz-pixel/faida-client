const asyncHandler = require('../middleware/async');
const Ledger = require('../models/Ledger');
const LedgerEntry = require('../models/LedgerEntry');
const Party = require('../models/Party');

// @desc    Get Ledger Report
// @route   GET /api/v1/reports/ledger
// @access  Private (accounts access)
exports.getLedgerReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, ledgerId, ledgerType, groupBy = 'month' } = req.query;

  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  // Build ledger filters
  let ledgerFilters = {};
  if (ledgerId) ledgerFilters._id = ledgerId;
  if (ledgerType) ledgerFilters.ledgerType = ledgerType;

  // Get ledgers
  const ledgers = await Ledger.find(ledgerFilters).sort({ ledgerName: 1 }).lean();

  // Get ledger entries for each ledger
  const ledgerReports = await Promise.all(
    ledgers.map(async (ledger) => {
      const entries = await LedgerEntry.find({
        ledgerId: ledger._id,
        ...dateFilter
      })
        .populate('refId', 'invoiceNo returnInvoiceNo')
        .sort({ date: 1 })
        .lean();

      // Group entries by period
      const groupedEntries = {};

      entries.forEach(entry => {
        const period = new Date(entry.date).toLocaleDateString();

        if (!groupedEntries[period]) {
          groupedEntries[period] = {
            date: entry.date,
            debitTotal: 0,
            creditTotal: 0,
            entries: []
          };
        }

        groupedEntries[period].entries.push(entry);
        groupedEntries[period].debitTotal += entry.debit || 0;
        groupedEntries[period].creditTotal += entry.credit || 0;
      });

      // Convert to array and calculate running balance
      const periods = Object.values(groupedEntries).sort((a, b) => new Date(a.date) - new Date(b.date));
      let runningBalance = ledger.currentBalance;

      periods.forEach(period => {
        period.openingBalance = runningBalance;
        runningBalance = period.openingBalance + period.debitTotal - period.creditTotal;
        period.closingBalance = runningBalance;
      });

      // Calculate summary
      const summary = {
        openingBalance: ledger.currentBalance,
        totalDebit: periods.reduce((sum, p) => sum + p.debitTotal, 0),
        totalCredit: periods.reduce((sum, p) => sum + p.creditTotal, 0),
        closingBalance: runningBalance,
        totalEntries: entries.length,
        periods: periods.length
      };

      return {
        ledger: {
          id: ledger._id,
          name: ledger.ledgerName,
          type: ledger.ledgerType,
          currentBalance: ledger.currentBalance
        },
        periods,
        summary
      };
    })
  );

  // Calculate overall summary
  const overallSummary = {
    totalLedgers: ledgerReports.length,
    totalDebit: ledgerReports.reduce((sum, lr) => sum + lr.summary.totalDebit, 0),
    totalCredit: ledgerReports.reduce((sum, lr) => sum + lr.summary.totalCredit, 0),
    totalEntries: ledgerReports.reduce((sum, lr) => sum + lr.summary.totalEntries, 0)
  };

  overallSummary.netBalance = overallSummary.totalDebit - overallSummary.totalCredit;

  res.status(200).json({
    success: true,
    data: {
      reports: ledgerReports,
      summary: overallSummary
    },
    meta: {
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
      groupBy,
      generatedAt: new Date()
    }
  });
});


// @desc    Get Trial Balance
// @route   GET /api/v1/reports/ledger/trial-balance
// @access  Private (accounts access)
exports.getTrialBalance = asyncHandler(async (req, res) => {
  const { asOfDate } = req.query;

  // Build date filter
  let dateFilter = {};
  if (asOfDate) {
    dateFilter.date = { $lte: new Date(asOfDate) };
  }

  // Get all ledgers with their balances and entries
  const trialBalance = await Ledger.aggregate([
    {
      $lookup: {
        from: 'ledgerentries',
        let: { ledgerId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$ledgerId', '$$ledgerId'] },
              ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
            }
          },
          {
            $group: {
              _id: '$ledgerId',
              totalDebit: { $sum: '$debit' },
              totalCredit: { $sum: '$credit' },
              entryCount: { $sum: 1 }
            }
          }
        ],
        as: 'entries'
      }
    },
    {
      $project: {
        ledgerName: 1,
        ledgerType: 1,
        currentBalance: 1,
        totalDebit: { $ifNull: [{ $arrayElemAt: ['$entries.totalDebit', 0] }, 0] },
        totalCredit: { $ifNull: [{ $arrayElemAt: ['$entries.totalCredit', 0] }, 0] },
        entryCount: { $ifNull: [{ $arrayElemAt: ['$entries.entryCount', 0] }, 0] }
      }
    },
    { $sort: { ledgerType: 1, ledgerName: 1 } }
  ]);

  // Calculate trial balance totals
  const totals = trialBalance.reduce(
    (acc, ledger) => {
      acc.totalDebit += ledger.totalDebit;
      acc.totalCredit += ledger.totalCredit;
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 }
  );

  // Check if trial balance balances
  const isBalanced = Math.abs(totals.totalDebit - totals.totalCredit) < 0.01;

  res.status(200).json({
    success: true,
    data: {
      trialBalance,
      totals,
      isBalanced,
      difference: totals.totalDebit - totals.totalCredit
    },
    meta: {
      asOfDate: asOfDate || 'Present',
      generatedAt: new Date()
    }
  });
});

// @desc    Get Balance Sheet
// @route   GET /api/v1/reports/ledger/balance-sheet
// @access  Private (accounts access)
exports.getBalanceSheet = asyncHandler(async (req, res) => {
  const { asOfDate } = req.query;

  // Build date filter
  let dateFilter = {};
  if (asOfDate) {
    dateFilter.date = { $lte: new Date(asOfDate) };
  }

  // Get ledger balances grouped by type
  const balanceSheet = await Ledger.aggregate([
    {
      $lookup: {
        from: 'ledgerentries',
        let: { ledgerId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$ledgerId', '$$ledgerId'] },
              ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
            }
          },
          {
            $group: {
              _id: '$ledgerId',
              totalDebit: { $sum: '$debit' },
              totalCredit: { $sum: '$credit' }
            }
          }
        ],
        as: 'entries'
      }
    },
    {
      $project: {
        ledgerName: 1,
        ledgerType: 1,
        currentBalance: 1,
        totalDebit: { $ifNull: [{ $arrayElemAt: ['$entries.totalDebit', 0] }, 0] },
        totalCredit: { $ifNull: [{ $arrayElemAt: ['$entries.totalCredit', 0] }, 0] }
      }
    },
    {
      $addFields: {
        netBalance: { $subtract: ['$totalDebit', '$totalCredit'] }
      }
    },
    {
      $group: {
        _id: '$ledgerType',
        ledgers: {
          $push: {
            name: '$ledgerName',
            balance: '$netBalance'
          }
        },
        totalBalance: { $sum: '$netBalance' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Organize balance sheet
  const assets = balanceSheet.find(item => ['customer', 'cash', 'bank'].includes(item._id)) || { ledgers: [], totalBalance: 0 };
  const liabilities = balanceSheet.find(item => ['supplier'].includes(item._id)) || { ledgers: [], totalBalance: 0 };
  const income = balanceSheet.find(item => ['sales'].includes(item._id)) || { ledgers: [], totalBalance: 0 };
  const expenses = balanceSheet.find(item => ['purchase', 'return'].includes(item._id)) || { ledgers: [], totalBalance: 0 };

  const balanceSheetData = {
    assets,
    liabilities,
    income,
    expenses,
    totalAssets: assets.totalBalance,
    totalLiabilities: liabilities.totalBalance,
    totalIncome: income.totalBalance,
    totalExpenses: expenses.totalBalance,
    netProfit: income.totalBalance - expenses.totalBalance
  };

  // Check if balance sheet balances
  const isBalanced = Math.abs(
    balanceSheetData.totalAssets - (balanceSheetData.totalLiabilities + balanceSheetData.netProfit)
  ) < 0.01;

  res.status(200).json({
    success: true,
    data: balanceSheetData,
    isBalanced,
    meta: {
      asOfDate: asOfDate || 'Present',
      generatedAt: new Date()
    }
  });
});

// @desc    Get Ledger Summary
// @route   GET /api/v1/reports/ledger/summary
// @access  Private (accounts access)
exports.getLedgerSummary = asyncHandler(async (req, res) => {
  const { ledgerType } = req.query;

  // Build filters
  let filters = {};
  if (ledgerType) filters.ledgerType = ledgerType;

  // Get ledger summary
  const summary = await Ledger.aggregate([
    { $match: filters },
    {
      $group: {
        _id: '$ledgerType',
        count: { $sum: 1 },
        totalBalance: { $sum: '$currentBalance' },
        ledgers: {
          $push: {
            name: '$ledgerName',
            balance: '$currentBalance'
          }
        }
      }
    },
    {
      $project: {
        ledgerType: '$_id',
        count: 1,
        totalBalance: 1,
        averageBalance: { $divide: ['$totalBalance', '$count'] },
        ledgers: 1
      }
    },
    { $sort: { ledgerType: 1 } }
  ]);

  // Calculate overall totals
  const totals = summary.reduce(
    (acc, type) => {
      acc.totalLedgers += type.count;
      acc.totalBalance += type.totalBalance;
      return acc;
    },
    { totalLedgers: 0, totalBalance: 0 }
  );

  res.status(200).json({
    success: true,
    data: {
      summary,
      totals
    },
    meta: {
      generatedAt: new Date()
    }
  });
});

// @desc    Export Ledger Report
// @route   GET /api/v1/reports/ledger/export
// @access  Private (accounts access)
exports.exportLedgerReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;

  // Get ledger data (reuse getLedgerReport logic)
  const { data } = await exports.getLedgerReport(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => { }
  );

  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ledger_report_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }

  // Default to CSV format
  let csv = 'Ledger Name,Ledger Type,Date,Debit,Credit,Opening Balance,Closing Balance\n';

  data.reports.forEach(report => {
    report.periods.forEach(period => {
      const date = new Date(period.date).toLocaleDateString();
      csv += `"${report.ledger.name}","${report.ledger.type}",${date},${period.debitTotal},${period.creditTotal},${period.openingBalance},${period.closingBalance}\n`;
    });
  });

  csv += `\nSummary\n`;
  csv += `Total Ledgers,${data.summary.totalLedgers}\n`;
  csv += `Total Debit,${data.summary.totalDebit}\n`;
  csv += `Total Credit,${data.summary.totalCredit}\n`;
  csv += `Net Balance,${data.summary.netBalance}\n`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="ledger_report_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
