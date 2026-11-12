const asyncHandler = require('../middleware/async');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const Item = require('../models/Item');
const Party = require('../models/Party');
const { applyBranchFilter } = require('../middleware/auth');

// @desc    Get Purchase Report
// @route   GET /api/v1/reports/purchases
// @access  Private (accounts access)
exports.getPurchaseReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, supplierId, itemId, groupBy = 'day' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Build additional filters
  let filters = { ...dateFilter };
  if (supplierId) filters.supplierId = supplierId;
  if (itemId) filters['items.itemId'] = itemId;

  // ENFORCE BRANCH SECURITY
  filters = await applyBranchFilter(req, filters, Purchase);
  
  // Get purchase data
  const purchaseData = await Purchase.aggregate([
    { $match: filters },
    {
      $group: {
        _id: {
          period: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
              date: '$date'
            }
          },
          supplier: '$supplierId'
        },
        totalPurchases: { $sum: '$grandTotal' },
        totalTax: { $sum: '$taxTotal' },
        totalDiscount: { $sum: '$discountTotal' },
        count: { $sum: 1 },
        items: { $sum: '$items.length' }
      }
    },
    {
      $lookup: {
        from: 'parties',
        localField: '_id.supplier',
        foreignField: '_id',
        as: 'supplier'
      }
    },
    { $unwind: '$supplier' },
    {
      $group: {
        _id: '$_id.period',
        totalPurchases: { $sum: '$totalPurchases' },
        totalTax: { $sum: '$totalTax' },
        totalDiscount: { $sum: '$totalDiscount' },
        count: { $sum: '$count' },
        items: { $sum: '$items' },
        suppliers: {
          $push: {
            name: '$supplier.name',
            amount: '$totalPurchases',
            count: '$count'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get purchase returns data
  const returnsData = await PurchaseReturn.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          period: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
              date: '$date'
            }
          }
        },
        totalReturns: { $sum: '$totalReturnAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Combine purchase and returns data
  const allPeriods = [...new Set([...purchaseData.map(p => p._id), ...returnsData.map(r => r._id)])].sort();
  
  const report = allPeriods.map(period => {
    const purchases = purchaseData.find(p => p._id === period) || { totalPurchases: 0, totalTax: 0, totalDiscount: 0, count: 0, items: 0, suppliers: [] };
    const returns = returnsData.find(r => r._id === period) || { totalReturns: 0, count: 0 };
    
    return {
      period,
      purchases: {
        total: purchases.totalPurchases,
        tax: purchases.totalTax,
        discount: purchases.totalDiscount,
        net: purchases.totalPurchases - purchases.totalDiscount,
        count: purchases.count,
        items: purchases.items,
        suppliers: purchases.suppliers
      },
      returns: {
        total: returns.totalReturns,
        count: returns.count
      },
      netPurchases: purchases.totalPurchases - returns.totalReturns
    };
  });
  
  // Calculate summary
  const summary = {
    totalPurchases: purchaseData.reduce((sum, p) => sum + p.totalPurchases, 0),
    totalReturns: returnsData.reduce((sum, r) => sum + r.totalReturns, 0),
    netPurchases: 0,
    totalTax: purchaseData.reduce((sum, p) => sum + p.totalTax, 0),
    totalDiscount: purchaseData.reduce((sum, p) => sum + p.totalDiscount, 0),
    totalOrders: purchaseData.reduce((sum, p) => sum + p.count, 0),
    totalItems: purchaseData.reduce((sum, p) => sum + p.items, 0),
    periods: report.length
  };
  
  summary.netPurchases = summary.totalPurchases - summary.totalReturns;
  summary.averageOrderValue = summary.totalOrders > 0 ? summary.totalPurchases / summary.totalOrders : 0;
  
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

// @desc    Get Top Purchased Items
// @route   GET /api/v1/reports/purchases/top-items
// @access  Private (accounts access)
exports.getTopPurchasedItems = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 10 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const topItems = await Purchase.aggregate([
    { $match: dateFilter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.itemId',
        totalQuantity: { $sum: '$items.qty' },
        totalAmount: { $sum: '$items.total' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'items',
        localField: '_id',
        foreignField: '_id',
        as: 'item'
      }
    },
    { $unwind: '$item' },
    {
      $project: {
        item: {
          name: '$item.name',
          sku: '$item.sku',
          category: '$item.category'
        },
        totalQuantity: 1,
        totalAmount: 1,
        count: 1
      }
    },
    { $sort: { totalAmount: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  res.status(200).json({
    success: true,
    data: topItems
  });
});

// @desc    Get Supplier Purchase Analysis
// @route   GET /api/v1/reports/purchases/supplier-analysis
// @access  Private (accounts access)
exports.getSupplierPurchaseAnalysis = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 10 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const supplierAnalysis = await Purchase.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$supplierId',
        totalPurchases: { $sum: '$grandTotal' },
        totalOrders: { $sum: 1 },
        totalItems: { $sum: '$items.length' },
        averageOrderValue: { $avg: '$grandTotal' },
        firstOrderDate: { $min: '$date' },
        lastOrderDate: { $max: '$date' }
      }
    },
    {
      $lookup: {
        from: 'parties',
        localField: '_id',
        foreignField: '_id',
        as: 'supplier'
      }
    },
    { $unwind: '$supplier' },
    {
      $project: {
        supplier: {
          name: '$supplier.name',
          mobile: '$supplier.mobile',
          email: '$supplier.email'
        },
        totalPurchases: 1,
        totalOrders: 1,
        totalItems: 1,
        averageOrderValue: { $round: ['$averageOrderValue', 2] },
        firstOrderDate: 1,
        lastOrderDate: 1
      }
    },
    { $sort: { totalPurchases: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  res.status(200).json({
    success: true,
    data: supplierAnalysis
  });
});

// @desc    Export Purchase Report
// @route   GET /api/v1/reports/purchases/export
// @access  Private (accounts access)
exports.exportPurchaseReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get purchase data (reuse getPurchaseReport logic)
  const { data } = await exports.getPurchaseReport(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="purchase_report_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Period,Total Purchases,Tax,Discount,Net Purchases,Orders,Items,Returns,Net Purchases After Returns\n';
  
  data.report.forEach(row => {
    csv += `${row.period},${row.purchases.total},${row.purchases.tax},${row.purchases.discount},${row.purchases.net},${row.purchases.count},${row.purchases.items},${row.returns.total},${row.netPurchases}\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Total Purchases,${data.summary.totalPurchases}\n`;
  csv += `Total Returns,${data.summary.totalReturns}\n`;
  csv += `Net Purchases,${data.summary.netPurchases}\n`;
  csv += `Total Tax,${data.summary.totalTax}\n`;
  csv += `Total Discount,${data.summary.totalDiscount}\n`;
  csv += `Total Orders,${data.summary.totalOrders}\n`;
  csv += `Average Order Value,${data.summary.averageOrderValue.toFixed(2)}\n`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="purchase_report_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
