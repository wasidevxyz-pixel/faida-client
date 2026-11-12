const asyncHandler = require('../middleware/async');
const BankTransaction = require('../models/BankTransaction');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');

// @desc    Get Bank Book Report
// @route   GET /api/v1/reports/bank-book
// @access  Private (accounts access)
exports.getBankBookReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, bankName, type, groupBy = 'day' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Build additional filters
  let filters = { ...dateFilter };
  if (bankName) filters.bankName = bankName;
  if (type) filters.type = type;
  
  // Get bank transactions
  const transactions = await BankTransaction.find(filters)
    .populate('partyId', 'name email phone')
    .populate('createdBy', 'name')
    .sort({ date: 1 });
  
  // Get bank ledgers and their balances
  const bankLedgers = await Ledger.find({ ledgerType: 'bank' });
  const bankBalances = bankLedgers.reduce((acc, ledger) => {
    acc[ledger.ledgerName] = ledger.currentBalance;
    return acc;
  }, {});
  
  // Group transactions by bank and period
  const groupedTransactions = {};
  
  transactions.forEach(transaction => {
    const bank = transaction.bankName;
    const period = new Date(transaction.date).toLocaleDateString();
    
    if (!groupedTransactions[bank]) {
      groupedTransactions[bank] = {
        bankName: bank,
        openingBalance: bankBalances[bank] || 0,
        periods: {}
      };
    }
    
    if (!groupedTransactions[bank].periods[period]) {
      groupedTransactions[bank].periods[period] = {
        date: transaction.date,
        deposits: [],
        withdrawals: [],
        depositsTotal: 0,
        withdrawalsTotal: 0,
        netFlow: 0
      };
    }
    
    if (transaction.type === 'deposit') {
      groupedTransactions[bank].periods[period].deposits.push(transaction);
      groupedTransactions[bank].periods[period].depositsTotal += transaction.amount;
    } else {
      groupedTransactions[bank].periods[period].withdrawals.push(transaction);
      groupedTransactions[bank].periods[period].withdrawalsTotal += transaction.amount;
    }
    
    groupedTransactions[bank].periods[period].netFlow = 
      groupedTransactions[bank].periods[period].depositsTotal - 
      groupedTransactions[bank].periods[period].withdrawalsTotal;
  });
  
  // Convert to array and calculate running balances
  const report = Object.values(groupedTransactions).map(bank => {
    const periods = Object.values(bank.periods).sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningBalance = bank.openingBalance;
    
    periods.forEach(period => {
      runningBalance += period.netFlow;
      period.closingBalance = runningBalance;
    });
    
    return {
      bankName: bank.bankName,
      openingBalance: bank.openingBalance,
      periods,
      closingBalance: runningBalance
    };
  });
  
  // Calculate summary
  const summary = {
    totalBanks: report.length,
    totalDeposits: transactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0),
    totalWithdrawals: transactions.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + t.amount, 0),
    netFlow: 0,
    totalTransactions: transactions.length,
    bankBalances
  };
  
  summary.netFlow = summary.totalDeposits - summary.totalWithdrawals;
  
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

// @desc    Get Bank Book Summary by Bank
// @route   GET /api/v1/reports/bank-book/bank-summary
// @access  Private (accounts access)
exports.getBankBookBankSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const bankSummary = await BankTransaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$bankName',
        totalDeposits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0]
          }
        },
        totalWithdrawals: {
          $sum: {
            $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0]
          }
        },
        depositCount: {
          $sum: {
            $cond: [{ $eq: ['$type', 'deposit'] }, 1, 0]
          }
        },
        withdrawalCount: {
          $sum: {
            $cond: [{ $eq: ['$type', 'withdrawal'] }, 1, 0]
          }
        },
        firstTransaction: { $min: '$date' },
        lastTransaction: { $max: '$date' }
      }
    },
    {
      $lookup: {
        from: 'ledgers',
        let: { bankName: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$ledgerName', '$$bankName'] },
              ledgerType: 'bank'
            }
          }
        ],
        as: 'ledger'
      }
    },
    {
      $project: {
        bankName: '$_id',
        totalDeposits: 1,
        totalWithdrawals: 1,
        depositCount: 1,
        withdrawalCount: 1,
        netFlow: { $subtract: ['$totalDeposits', '$totalWithdrawals'] },
        totalTransactions: { $add: ['$depositCount', '$withdrawalCount'] },
        firstTransaction: 1,
        lastTransaction: 1,
        currentBalance: { $arrayElemAt: ['$ledger.currentBalance', 0] }
      }
    },
    { $sort: { totalDeposits: -1 } }
  ]);
  
  res.status(200).json({
    success: true,
    data: bankSummary
  });
});

// @desc    Get Bank-wise Cash Flow Analysis
// @route   GET /api/v1/reports/bank-book/cash-flow
// @access  Private (accounts access)
exports.getBankCashFlowAnalysis = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'month' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const bankCashFlow = await BankTransaction.aggregate([
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
          bank: '$bankName',
          type: '$type'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: {
          period: '$_id.period',
          bank: '$_id.bank'
        },
        deposits: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'deposit'] }, '$totalAmount', 0]
          }
        },
        withdrawals: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'withdrawal'] }, '$totalAmount', 0]
          }
        },
        depositCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'deposit'] }, '$count', 0]
          }
        },
        withdrawalCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'withdrawal'] }, '$count', 0]
          }
        }
      }
    },
    {
      $project: {
        period: '$_id.period',
        bankName: '$_id.bank',
        deposits: 1,
        withdrawals: 1,
        netFlow: { $subtract: ['$deposits', '$withdrawals'] },
        totalTransactions: { $add: ['$depositCount', '$withdrawalCount'] }
      }
    },
    { $sort: { period: 1, bankName: 1 } }
  ]);
  
  // Group by bank for better structure
  const bankWiseFlow = {};
  bankCashFlow.forEach(flow => {
    if (!bankWiseFlow[flow.bankName]) {
      bankWiseFlow[flow.bankName] = [];
    }
    bankWiseFlow[flow.bankName].push(flow);
  });
  
  // Calculate running balances for each bank
  for (const bankName in bankWiseFlow) {
    let runningBalance = 0;
    bankWiseFlow[bankName] = bankWiseFlow[bankName].map(period => {
      runningBalance += period.netFlow;
      return { ...period, runningBalance };
    });
  }
  
  // Calculate summary
  const summary = {
    totalDeposits: bankCashFlow.reduce((sum, f) => sum + f.deposits, 0),
    totalWithdrawals: bankCashFlow.reduce((sum, f) => sum + f.withdrawals, 0),
    netFlow: 0,
    totalTransactions: bankCashFlow.reduce((sum, f) => sum + f.totalTransactions, 0),
    banks: Object.keys(bankWiseFlow).length
  };
  
  summary.netFlow = summary.totalDeposits - summary.totalWithdrawals;
  
  res.status(200).json({
    success: true,
    data: {
      bankWiseFlow,
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

// @desc    Export Bank Book Report
// @route   GET /api/v1/reports/bank-book/export
// @access  Private (accounts access)
exports.exportBankBookReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get bank book data (reuse getBankBookReport logic)
  const { data } = await exports.getBankBookReport(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="bank_book_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Bank,Date,Deposits,Withdrawals,Net Flow,Closing Balance\n';
  
  data.report.forEach(bank => {
    bank.periods.forEach(period => {
      const date = new Date(period.date).toLocaleDateString();
      csv += `"${bank.bankName}",${date},${period.depositsTotal},${period.withdrawalsTotal},${period.netFlow},${period.closingBalance}\n`;
    });
  });
  
  csv += `\nSummary\n`;
  csv += `Total Banks,${data.summary.totalBanks}\n`;
  csv += `Total Deposits,${data.summary.totalDeposits}\n`;
  csv += `Total Withdrawals,${data.summary.totalWithdrawals}\n`;
  csv += `Net Flow,${data.summary.netFlow}\n`;
  csv += `Total Transactions,${data.summary.totalTransactions}\n`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="bank_book_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
