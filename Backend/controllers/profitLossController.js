const asyncHandler = require('../middleware/async');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const Expense = require('../models/Expense');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');

// @desc    Get Profit & Loss Report
// @route   GET /api/v1/reports/profit-loss
// @access  Private (accounts access)
exports.getProfitLossReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'month' } = req.query;
  
  // Validate dates
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  
  // Get all ledgers for categorization
  const ledgers = await Ledger.find({}).select('_id name ledgerType');
  
  // Categorize ledgers
  const incomeLedgers = ledgers.filter(l => ['income', 'sales'].includes(l.ledgerType)).map(l => l._id);
  const expenseLedgers = ledgers.filter(l => ['expense', 'purchase', 'direct_expense', 'indirect_expense'].includes(l.ledgerType)).map(l => l._id);
  
  // Date grouping
  const dateGroup = {
    $dateToString: {
      format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
      date: '$date'
    }
  };
  
  // Get income data
  const incomeData = await LedgerEntry.aggregate([
    {
      $match: {
        ledgerId: { $in: incomeLedgers },
        date: { $gte: start, $lte: end },
        credit: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: {
          period: dateGroup,
          ledger: '$ledgerId'
        },
        amount: { $sum: '$credit' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'ledgers',
        localField: '_id.ledger',
        foreignField: '_id',
        as: 'ledger'
      }
    },
    { $unwind: '$ledger' },
    {
      $group: {
        _id: '$_id.period',
        total: { $sum: '$amount' },
        categories: {
          $push: {
            ledger: '$ledger.name',
            amount: '$amount',
            count: '$count'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get expense data
  const expenseData = await LedgerEntry.aggregate([
    {
      $match: {
        ledgerId: { $in: expenseLedgers },
        date: { $gte: start, $lte: end },
        debit: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: {
          period: dateGroup,
          ledger: '$ledgerId'
        },
        amount: { $sum: '$debit' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'ledgers',
        localField: '_id.ledger',
        foreignField: '_id',
        as: 'ledger'
      }
    },
    { $unwind: '$ledger' },
    {
      $group: {
        _id: '$_id.period',
        total: { $sum: '$amount' },
        categories: {
          $push: {
            ledger: '$ledger.name',
            amount: '$amount',
            count: '$count'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get gross profit data from sales and purchase
  const grossProfitData = await getGrossProfitData(start, end, dateGroup);
  
  // Combine all data
  const periods = [...new Set([...incomeData.map(i => i._id), ...expenseData.map(e => e._id)])].sort();
  
  const report = periods.map(period => {
    const income = incomeData.find(i => i._id === period) || { total: 0, categories: [] };
    const expense = expenseData.find(e => e._id === period) || { total: 0, categories: [] };
    const grossProfit = grossProfitData.find(g => g._id === period) || { grossProfit: 0 };
    
    const netProfit = income.total - expense.total;
    const profitMargin = income.total > 0 ? (netProfit / income.total) * 100 : 0;
    
    return {
      period,
      income: {
        total: income.total,
        categories: income.categories
      },
      expense: {
        total: expense.total,
        categories: expense.categories
      },
      grossProfit: grossProfit.grossProfit,
      netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2))
    };
  });
  
  // Calculate summary
  const summary = {
    totalIncome: incomeData.reduce((sum, i) => sum + i.total, 0),
    totalExpense: expenseData.reduce((sum, e) => sum + e.total, 0),
    totalGrossProfit: grossProfitData.reduce((sum, g) => sum + g.grossProfit, 0),
    periods: report.length,
    dateRange: { start, end }
  };
  
  summary.netProfit = summary.totalIncome - summary.totalExpense;
  summary.profitMargin = summary.totalIncome > 0 ? 
    parseFloat(((summary.netProfit / summary.totalIncome) * 100).toFixed(2)) : 0;
  
  res.status(200).json({
    success: true,
    data: {
      report,
      summary
    },
    meta: {
      startDate: start,
      endDate: end,
      groupBy,
      generatedAt: new Date()
    }
  });
});

// @desc    Get detailed P&L breakdown
// @route   GET /api/v1/reports/profit-loss/detailed
// @access  Private (accounts access)
exports.getDetailedProfitLoss = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Validate dates
  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1)); // Start of current month
  const end = endDate ? new Date(endDate) : new Date();
  
  // Get all ledgers with their hierarchy
  const ledgers = await Ledger.aggregate([
    {
      $graphLookup: {
        from: 'ledgers',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parentLedger',
        as: 'children',
        depthField: 'depth'
      }
    },
    {
      $project: {
        name: 1,
        ledgerType: 1,
        parentLedger: 1,
        children: {
          $map: {
            input: '$children',
            as: 'child',
            in: '$$child._id'
          }
        }
      }
    }
  ]);
  
  // Categorize ledgers
  const incomeLedgers = [];
  const cogsLedgers = [];
  const operatingExpenseLedgers = [];
  const otherIncomeLedgers = [];
  const otherExpenseLedgers = [];
  
  ledgers.forEach(ledger => {
    const childLedgers = [ledger._id, ...(ledger.children || [])];
    
    switch (ledger.ledgerType) {
      case 'sales':
        incomeLedgers.push(...childLedgers);
        break;
      case 'direct_expense':
      case 'purchase':
        cogsLedgers.push(...childLedgers);
        break;
      case 'indirect_expense':
        operatingExpenseLedgers.push(...childLedgers);
        break;
      case 'income':
        otherIncomeLedgers.push(...childLedgers);
        break;
      case 'expense':
        otherExpenseLedgers.push(...childLedgers);
        break;
    }
  });
  
  // Get ledger amounts
  const getLedgerAmounts = async (ledgerIds, isDebit = false) => {
    const matchField = isDebit ? 'debit' : 'credit';
    
    const result = await LedgerEntry.aggregate([
      {
        $match: {
          ledgerId: { $in: ledgerIds },
          date: { $gte: start, $lte: end },
          [matchField]: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: '$ledgerId',
          amount: { $sum: `$${matchField}` },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'ledgers',
          localField: '_id',
          foreignField: '_id',
          as: 'ledger'
        }
      },
      { $unwind: '$ledger' },
      {
        $project: {
          _id: 0,
          ledger: {
            id: '$ledger._id',
            name: '$ledger.name',
            code: '$ledger.code',
            ledgerType: '$ledger.ledgerType'
          },
          amount: 1,
          count: 1
        }
      }
    ]);
    
    return result;
  };
  
  // Get all ledger amounts
  const [
    incomeItems,
    cogsItems,
    operatingExpenseItems,
    otherIncomeItems,
    otherExpenseItems
  ] = await Promise.all([
    getLedgerAmounts(incomeLedgers, false),
    getLedgerAmounts(cogsLedgers, true),
    getLedgerAmounts(operatingExpenseLedgers, true),
    getLedgerAmounts(otherIncomeLedgers, false),
    getLedgerAmounts(otherExpenseLedgers, true)
  ]);
  
  // Calculate totals
  const calculateTotal = (items) => items.reduce((sum, item) => sum + item.amount, 0);
  
  const income = calculateTotal(incomeItems);
  const cogs = calculateTotal(cogsItems);
  const grossProfit = income - cogs;
  const operatingExpenses = calculateTotal(operatingExpenseItems);
  const operatingProfit = grossProfit - operatingExpenses;
  const otherIncome = calculateTotal(otherIncomeItems);
  const otherExpenses = calculateTotal(otherExpenseItems);
  const netProfit = operatingProfit + otherIncome - otherExpenses;
  
  // Calculate percentages
  const calculatePercentage = (value, base) => base > 0 ? (value / base) * 100 : 0;
  
  // Prepare response
  const response = {
    income: {
      items: incomeItems,
      total: income,
      percentage: 100
    },
    costOfGoodsSold: {
      items: cogsItems,
      total: cogs,
      percentage: calculatePercentage(cogs, income)
    },
    grossProfit: {
      total: grossProfit,
      percentage: calculatePercentage(grossProfit, income)
    },
    operatingExpenses: {
      items: operatingExpenseItems,
      total: operatingExpenses,
      percentage: calculatePercentage(operatingExpenses, income)
    },
    operatingProfit: {
      total: operatingProfit,
      percentage: calculatePercentage(operatingProfit, income)
    },
    otherIncome: {
      items: otherIncomeItems,
      total: otherIncome,
      percentage: calculatePercentage(otherIncome, income)
    },
    otherExpenses: {
      items: otherExpenseItems,
      total: otherExpenses,
      percentage: calculatePercentage(otherExpenses, income)
    },
    netProfit: {
      total: netProfit,
      percentage: calculatePercentage(netProfit, income)
    },
    meta: {
      startDate: start,
      endDate: end,
      generatedAt: new Date()
    }
  };
  
  res.status(200).json({
    success: true,
    data: response
  });
});

// @desc    Export Profit & Loss Report
// @route   GET /api/v1/reports/profit-loss/export
// @access  Private (accounts access)
exports.exportProfitLossReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get detailed P&L data
  const { data } = await exports.getDetailedProfitLoss(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    // Set headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="profit_loss_${startDate || 'all'}_${endDate || 'all'}.json"`);
    
    // Send JSON data
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Category,Subcategory,Amount,Percentage\n';
  
  // Add income section
  csv += 'Income,,,\n';
  data.income.items.forEach(item => {
    csv += `,${item.ledger.name},${item.amount},${((item.amount / data.income.total) * 100).toFixed(2)}%\n`;
  });
  csv += `Total Income,,${data.income.total},100.00%\n\n`;
  
  // Add COGS section
  csv += 'Cost of Goods Sold,,,\n';
  data.costOfGoodsSold.items.forEach(item => {
    csv += `,${item.ledger.name},${item.amount},${((item.amount / data.income.total) * 100).toFixed(2)}%\n`;
  });
  csv += `Total COGS,,${data.costOfGoodsSold.total},${data.costOfGoodsSold.percentage.toFixed(2)}%\n`;
  csv += `Gross Profit,,${data.grossProfit.total},${data.grossProfit.percentage.toFixed(2)}%\n\n`;
  
  // Add operating expenses section
  csv += 'Operating Expenses,,,\n';
  data.operatingExpenses.items.forEach(item => {
    csv += `,${item.ledger.name},${item.amount},${((item.amount / data.income.total) * 100).toFixed(2)}%\n`;
  });
  csv += `Total Operating Expenses,,${data.operatingExpenses.total},${data.operatingExpenses.percentage.toFixed(2)}%\n`;
  csv += `Operating Profit,,${data.operatingProfit.total},${data.operatingProfit.percentage.toFixed(2)}%\n\n`;
  
  // Add other income section
  csv += 'Other Income,,,\n';
  data.otherIncome.items.forEach(item => {
    csv += `,${item.ledger.name},${item.amount},${((item.amount / data.income.total) * 100).toFixed(2)}%\n`;
  });
  csv += `Total Other Income,,${data.otherIncome.total},${data.otherIncome.percentage.toFixed(2)}%\n\n`;
  
  // Add other expenses section
  csv += 'Other Expenses,,,\n';
  data.otherExpenses.items.forEach(item => {
    csv += `,${item.ledger.name},${item.amount},${((item.amount / data.income.total) * 100).toFixed(2)}%\n`;
  });
  csv += `Total Other Expenses,,${data.otherExpenses.total},${data.otherExpenses.percentage.toFixed(2)}%\n\n`;
  
  // Add net profit
  csv += `Net Profit,,${data.netProfit.total},${data.netProfit.percentage.toFixed(2)}%\n`;
  
  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="profit_loss_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  
  // Send CSV data
  res.send(csv);
});

// Helper function to calculate gross profit from sales and purchases
async function getGrossProfitData(start, end, dateGroup) {
  // Get sales data
  const salesData = await Sale.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateGroup.$dateToString.format, date: '$date' } },
        totalSales: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Get purchase data
  const purchaseData = await Purchase.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateGroup.$dateToString.format, date: '$date' } },
        totalPurchases: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Get sales returns data
  const salesReturnsData = await SalesReturn.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateGroup.$dateToString.format, date: '$date' } },
        totalReturns: { $sum: '$totalReturnAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Get purchase returns data
  const purchaseReturnsData = await PurchaseReturn.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateGroup.$dateToString.format, date: '$date' } },
        totalReturns: { $sum: '$totalReturnAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Combine all periods
  const allPeriods = [
    ...salesData.map(s => s._id),
    ...purchaseData.map(p => p._id),
    ...salesReturnsData.map(sr => sr._id),
    ...purchaseReturnsData.map(pr => pr._id)
  ];
  
  const uniquePeriods = [...new Set(allPeriods)].sort();
  
  // Calculate gross profit for each period
  return uniquePeriods.map(period => {
    const sales = salesData.find(s => s._id === period)?.totalSales || 0;
    const purchases = purchaseData.find(p => p._id === period)?.totalPurchases || 0;
    const salesReturns = salesReturnsData.find(sr => sr._id === period)?.totalReturns || 0;
    const purchaseReturns = purchaseReturnsData.find(pr => pr._id === period)?.totalReturns || 0;
    
    const netSales = sales - salesReturns;
    const netPurchases = purchases - purchaseReturns;
    const grossProfit = netSales - netPurchases;
    
    return {
      _id: period,
      grossProfit,
      netSales,
      netPurchases
    };
  });
}
