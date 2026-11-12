const asyncHandler = require('../middleware/async');
const CashTransaction = require('../models/CashTransaction');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');

// @desc    Get Cash Book Report
// @route   GET /api/v1/reports/cash-book
// @access  Private (accounts access)
exports.getCashBookReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, partyId, type, groupBy = 'day' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Build additional filters
  let filters = { ...dateFilter };
  if (partyId) filters.partyId = partyId;
  if (type) filters.type = type;
  
  // Get cash transactions
  const transactions = await CashTransaction.find(filters)
    .populate('partyId', 'name email phone')
    .populate('createdBy', 'name')
    .sort({ date: 1 });
  
  // Get cash ledger balance
  const cashLedger = await Ledger.findOne({ ledgerType: 'cash' });
  const openingBalance = cashLedger ? cashLedger.currentBalance : 0;
  
  // Group transactions by period
  const groupedTransactions = {};
  
  transactions.forEach(transaction => {
    const period = new Date(transaction.date).toLocaleDateString();
    
    if (!groupedTransactions[period]) {
      groupedTransactions[period] = {
        date: transaction.date,
        receipts: [],
        payments: [],
        receiptsTotal: 0,
        paymentsTotal: 0,
        netFlow: 0
      };
    }
    
    if (transaction.type === 'receipt') {
      groupedTransactions[period].receipts.push(transaction);
      groupedTransactions[period].receiptsTotal += transaction.amount;
    } else {
      groupedTransactions[period].payments.push(transaction);
      groupedTransactions[period].paymentsTotal += transaction.amount;
    }
    
    groupedTransactions[period].netFlow = 
      groupedTransactions[period].receiptsTotal - groupedTransactions[period].paymentsTotal;
  });
  
  // Convert to array and calculate running balance
  const report = Object.values(groupedTransactions);
  let runningBalance = openingBalance;
  
  report.forEach(day => {
    runningBalance += day.netFlow;
    day.closingBalance = runningBalance;
  });
  
  // Calculate summary
  const summary = {
    openingBalance,
    totalReceipts: transactions.filter(t => t.type === 'receipt').reduce((sum, t) => sum + t.amount, 0),
    totalPayments: transactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0),
    netFlow: 0,
    closingBalance: runningBalance,
    totalTransactions: transactions.length,
    periods: report.length
  };
  
  summary.netFlow = summary.totalReceipts - summary.totalPayments;
  
  res.status(200).json({
    success: true,
    data: {
      report,
      summary
    },
    meta: {
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
      groupBy,
      generatedAt: new Date()
    }
  });
});

// @desc    Get Cash Book Summary by Party
// @route   GET /api/v1/reports/cash-book/party-summary
// @access  Private (accounts access)
exports.getCashBookPartySummary = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 20 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const partySummary = await CashTransaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$partyId',
        totalReceipts: {
          $sum: {
            $cond: [{ $eq: ['$type', 'receipt'] }, '$amount', 0]
          }
        },
        totalPayments: {
          $sum: {
            $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0]
          }
        },
        receiptCount: {
          $sum: {
            $cond: [{ $eq: ['$type', 'receipt'] }, 1, 0]
          }
        },
        paymentCount: {
          $sum: {
            $cond: [{ $eq: ['$type', 'payment'] }, 1, 0]
          }
        },
        firstTransaction: { $min: '$date' },
        lastTransaction: { $max: '$date' }
      }
    },
    {
      $lookup: {
        from: 'parties',
        localField: '_id',
        foreignField: '_id',
        as: 'party'
      }
    },
    { $unwind: '$party' },
    {
      $project: {
        party: {
          name: '$party.name',
          mobile: '$party.mobile',
          email: '$party.email'
        },
        totalReceipts: 1,
        totalPayments: 1,
        receiptCount: 1,
        paymentCount: 1,
        netFlow: { $subtract: ['$totalReceipts', '$totalPayments'] },
        totalTransactions: { $add: ['$receiptCount', '$paymentCount'] },
        firstTransaction: 1,
        lastTransaction: 1
      }
    },
    { $sort: { totalReceipts: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  res.status(200).json({
    success: true,
    data: partySummary
  });
});

// @desc    Get Cash Flow Analysis
// @route   GET /api/v1/reports/cash-book/cash-flow
// @access  Private (accounts access)
exports.getCashFlowAnalysis = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'month' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const cashFlow = await CashTransaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          period: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
              date: '$date'
            }
          },
          type: '$type'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.period',
        receipts: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'receipt'] }, '$totalAmount', 0]
          }
        },
        payments: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'payment'] }, '$totalAmount', 0]
          }
        },
        receiptCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'receipt'] }, '$count', 0]
          }
        },
        paymentCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'payment'] }, '$count', 0]
          }
        }
      }
    },
    {
      $project: {
        period: '$_id',
        receipts: 1,
        payments: 1,
        netFlow: { $subtract: ['$receipts', '$payments'] },
        totalTransactions: { $add: ['$receiptCount', '$paymentCount'] }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Calculate running balance
  let runningBalance = 0;
  const cashFlowWithBalance = cashFlow.map(period => {
    runningBalance += period.netFlow;
    return {
      ...period,
      runningBalance
    };
  });
  
  // Calculate summary
  const summary = {
    totalReceipts: cashFlow.reduce((sum, p) => sum + p.receipts, 0),
    totalPayments: cashFlow.reduce((sum, p) => sum + p.payments, 0),
    netFlow: 0,
    totalTransactions: cashFlow.reduce((sum, p) => sum + p.totalTransactions, 0),
    periods: cashFlow.length
  };
  
  summary.netFlow = summary.totalReceipts - summary.totalPayments;
  summary.finalBalance = runningBalance;
  
  res.status(200).json({
    success: true,
    data: {
      cashFlow: cashFlowWithBalance,
      summary
    },
    meta: {
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
      groupBy,
      generatedAt: new Date()
    }
  });
});

// @desc    Export Cash Book Report
// @route   GET /api/v1/reports/cash-book/export
// @access  Private (accounts access)
exports.exportCashBookReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get cash book data (reuse getCashBookReport logic)
  const { data } = await exports.getCashBookReport(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cash_book_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Date,Receipts,Payments,Net Flow,Closing Balance\n';
  
  data.report.forEach(day => {
    const date = new Date(day.date).toLocaleDateString();
    csv += `${date},${day.receiptsTotal},${day.paymentsTotal},${day.netFlow},${day.closingBalance}\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Opening Balance,${data.summary.openingBalance}\n`;
  csv += `Total Receipts,${data.summary.totalReceipts}\n`;
  csv += `Total Payments,${data.summary.totalPayments}\n`;
  csv += `Net Flow,${data.summary.netFlow}\n`;
  csv += `Closing Balance,${data.summary.closingBalance}\n`;
  csv += `Total Transactions,${data.summary.totalTransactions}\n`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="cash_book_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
