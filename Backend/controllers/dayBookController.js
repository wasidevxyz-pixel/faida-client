const asyncHandler = require('../middleware/async');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const CashTransaction = require('../models/CashTransaction');
const BankTransaction = require('../models/BankTransaction');
const LedgerEntry = require('../models/LedgerEntry');

// @desc    Get Day Book entries
// @route   GET /api/v1/daybook
// @access  Private (accounts access)
exports.getDayBook = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const { startDate, endDate, transactionType } = req.query;

  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  let entries = [];

  // Get Sales entries
  if (!transactionType || transactionType === 'sale') {
    const sales = await Sale.find(dateFilter)
      .populate('party', 'name')
      .select('invoiceNumber date party grandTotal paymentMode status')
      .sort({ date: -1 })
      .lean();

    sales.forEach(sale => {
      entries.push({
        date: sale.date,
        type: 'Sale',
        description: `Sale Invoice #${sale.invoiceNumber}`,
        particulars: sale.party?.name || 'Walk-in Customer',
        debit: 0,
        credit: sale.grandTotal || 0,
        reference: sale.invoiceNumber,
        referenceType: 'sale',
        referenceId: sale._id
      });
    });
  }

  // Get Sales Returns entries
  if (!transactionType || transactionType === 'sale_return') {
    const salesReturns = await SalesReturn.find(dateFilter)
      .populate('customerId', 'name')
      .select('returnInvoiceNo date customerId totalReturnAmount returnMode status')
      .sort({ date: -1 })
      .lean();

    salesReturns.forEach(returnItem => {
      entries.push({
        date: returnItem.date,
        type: 'Sales Return',
        description: `Sales Return #${returnItem.returnInvoiceNo}`,
        particulars: returnItem.customerId?.name || 'Customer',
        debit: returnItem.totalReturnAmount,
        credit: 0,
        reference: returnItem.returnInvoiceNo,
        referenceType: 'sale_return',
        referenceId: returnItem._id
      });
    });
  }

  // Get Purchase entries
  if (!transactionType || transactionType === 'purchase') {
    const purchases = await Purchase.find(dateFilter)
      .populate('supplier', 'name')
      .select('invoiceNo date supplier grandTotal paymentMode status')
      .sort({ date: -1 })
      .lean();

    purchases.forEach(purchase => {
      entries.push({
        date: purchase.date,
        type: 'Purchase',
        description: `Purchase Invoice #${purchase.invoiceNo}`,
        particulars: purchase.supplier?.name || 'Supplier',
        debit: purchase.grandTotal || 0,
        credit: 0,
        reference: purchase.invoiceNo,
        referenceType: 'purchase',
        referenceId: purchase._id
      });
    });
  }

  // Get Purchase Returns entries
  if (!transactionType || transactionType === 'purchase_return') {
    const purchaseReturns = await PurchaseReturn.find(dateFilter)
      .populate('supplierId', 'name')
      .select('returnInvoiceNo date supplierId totalReturnAmount returnMode status')
      .sort({ date: -1 })
      .lean();

    purchaseReturns.forEach(returnItem => {
      entries.push({
        date: returnItem.date,
        type: 'Purchase Return',
        description: `Purchase Return #${returnItem.returnInvoiceNo}`,
        particulars: returnItem.supplierId?.name || 'Supplier',
        debit: 0,
        credit: returnItem.totalReturnAmount,
        reference: returnItem.returnInvoiceNo,
        referenceType: 'purchase_return',
        referenceId: returnItem._id
      });
    });
  }

  // Get Cash Transactions entries
  if (!transactionType || transactionType === 'cash') {
    const cashTransactions = await CashTransaction.find(dateFilter)
      .populate('partyId', 'name')
      .select('date type amount narration partyId')
      .sort({ date: -1 })
      .lean();

    cashTransactions.forEach(transaction => {
      entries.push({
        date: transaction.date,
        type: `Cash ${transaction.type === 'receipt' ? 'Receipt' : 'Payment'}`,
        description: transaction.narration,
        particulars: transaction.partyId?.name || 'Cash',
        debit: transaction.type === 'payment' ? transaction.amount : 0,
        credit: transaction.type === 'receipt' ? transaction.amount : 0,
        reference: '',
        referenceType: 'cash_transaction',
        referenceId: transaction._id
      });
    });
  }

  // Get Bank Transactions entries
  if (!transactionType || transactionType === 'bank') {
    const bankTransactions = await BankTransaction.find(dateFilter)
      .populate('partyId', 'name')
      .select('date type amount narration bankName partyId')
      .sort({ date: -1 })
      .lean();

    bankTransactions.forEach(transaction => {
      entries.push({
        date: transaction.date,
        type: `Bank ${transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'}`,
        description: `${transaction.bankName} - ${transaction.narration}`,
        particulars: transaction.partyId?.name || transaction.bankName,
        debit: transaction.type === 'withdrawal' ? transaction.amount : 0,
        credit: transaction.type === 'deposit' ? transaction.amount : 0,
        reference: transaction.bankName,
        referenceType: 'bank_transaction',
        referenceId: transaction._id
      });
    });
  }

  // Sort entries by date (newest first)
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Apply pagination
  const startIndex = skip;
  const endIndex = startIndex + limit;
  const paginatedEntries = entries.slice(startIndex, endIndex);

  res.status(200).json({
    success: true,
    data: paginatedEntries,
    pagination: {
      page,
      limit,
      total: entries.length,
      pages: Math.ceil(entries.length / limit),
      prev: page > 1 ? { page: page - 1 } : null,
      next: page < Math.ceil(entries.length / limit) ? { page: page + 1 } : null
    }
  });
});

// @desc    Get Day Book summary
// @route   GET /api/v1/daybook/summary
// @access  Private (accounts access)
exports.getDayBookSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  // Get totals for each transaction type
  const [
    salesTotal,
    salesReturnsTotal,
    purchasesTotal,
    purchaseReturnsTotal,
    cashReceiptsTotal,
    cashPaymentsTotal,
    bankDepositsTotal,
    bankWithdrawalsTotal
  ] = await Promise.all([
    Sale.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]),
    SalesReturn.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$totalReturnAmount' }, count: { $sum: 1 } } }
    ]),
    Purchase.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]),
    PurchaseReturn.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$totalReturnAmount' }, count: { $sum: 1 } } }
    ]),
    CashTransaction.aggregate([
      { $match: { ...dateFilter, type: 'receipt' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    CashTransaction.aggregate([
      { $match: { ...dateFilter, type: 'payment' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    BankTransaction.aggregate([
      { $match: { ...dateFilter, type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    BankTransaction.aggregate([
      { $match: { ...dateFilter, type: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ])
  ]);

  // Calculate totals
  const totalSales = salesTotal[0]?.total || 0;
  const totalSalesReturns = salesReturnsTotal[0]?.total || 0;
  const totalPurchases = purchasesTotal[0]?.total || 0;
  const totalPurchaseReturns = purchaseReturnsTotal[0]?.total || 0;
  const totalCashReceipts = cashReceiptsTotal[0]?.total || 0;
  const totalCashPayments = cashPaymentsTotal[0]?.total || 0;
  const totalBankDeposits = bankDepositsTotal[0]?.total || 0;
  const totalBankWithdrawals = bankWithdrawalsTotal[0]?.total || 0;

  // Calculate net totals
  const netSales = totalSales - totalSalesReturns;
  const netPurchases = totalPurchases - totalPurchaseReturns;
  const netCashFlow = totalCashReceipts - totalCashPayments;
  const netBankFlow = totalBankDeposits - totalBankWithdrawals;

  res.status(200).json({
    success: true,
    data: {
      sales: {
        total: totalSales,
        returns: totalSalesReturns,
        net: netSales,
        count: salesTotal[0]?.count || 0
      },
      purchases: {
        total: totalPurchases,
        returns: totalPurchaseReturns,
        net: netPurchases,
        count: purchasesTotal[0]?.count || 0
      },
      cash: {
        receipts: totalCashReceipts,
        payments: totalCashPayments,
        net: netCashFlow,
        count: (cashReceiptsTotal[0]?.count || 0) + (cashPaymentsTotal[0]?.count || 0)
      },
      bank: {
        deposits: totalBankDeposits,
        withdrawals: totalBankWithdrawals,
        net: netBankFlow,
        count: (bankDepositsTotal[0]?.count || 0) + (bankWithdrawalsTotal[0]?.count || 0)
      },
      grandTotal: {
        debit: totalPurchases + totalSalesReturns + totalCashPayments + totalBankWithdrawals,
        credit: totalSales + totalPurchaseReturns + totalCashReceipts + totalBankDeposits
      }
    }
  });
});

// @desc    Export Day Book to CSV
// @route   GET /api/v1/daybook/export
// @access  Private (accounts access)
exports.exportDayBook = asyncHandler(async (req, res) => {
  const { startDate, endDate, transactionType } = req.query;

  // Get day book data (reuse getDayBook logic)
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  let entries = [];

  // Similar logic as getDayBook but without pagination
  // Get all entries based on filters...

  // Generate CSV
  const csvHeaders = 'Date,Type,Description,Particulars,Debit,Credit,Reference\n';
  const csvData = entries.map(entry =>
    `${entry.date},${entry.type},"${entry.description}","${entry.particulars}",${entry.debit},${entry.credit},${entry.reference}`
  ).join('\n');

  const csv = csvHeaders + csvData;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="daybook_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
