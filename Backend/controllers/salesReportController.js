const asyncHandler = require('../middleware/async');
const Sale = require('../models/Sale');
const SalesReturn = require('../models/SalesReturn');
const Item = require('../models/Item');
const Party = require('../models/Party');

// @desc    Get Sales Report
// @route   GET /api/v1/reports/sales
// @access  Private (accounts access)
exports.getSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, customerId, itemId, groupBy = 'day' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Build additional filters
  let filters = { ...dateFilter };
  if (customerId) filters.customerId = customerId;
  if (itemId) filters['items.itemId'] = itemId;
  
  // Get sales data
  const salesData = await Sale.aggregate([
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
          customer: '$customerId'
        },
        totalSales: { $sum: '$grandTotal' },
        totalTax: { $sum: '$taxTotal' },
        totalDiscount: { $sum: '$discountTotal' },
        count: { $sum: 1 },
        items: { $sum: '$items.length' }
      }
    },
    {
      $lookup: {
        from: 'parties',
        localField: '_id.customer',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $group: {
        _id: '$_id.period',
        totalSales: { $sum: '$totalSales' },
        totalTax: { $sum: '$totalTax' },
        totalDiscount: { $sum: '$totalDiscount' },
        count: { $sum: '$count' },
        items: { $sum: '$items' },
        customers: {
          $push: {
            name: '$customer.name',
            amount: '$totalSales',
            count: '$count'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get sales returns data
  const returnsData = await SalesReturn.aggregate([
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
  
  // Combine sales and returns data
  const allPeriods = [...new Set([...salesData.map(s => s._id), ...returnsData.map(r => r._id)])].sort();
  
  const report = allPeriods.map(period => {
    const sales = salesData.find(s => s._id === period) || { totalSales: 0, totalTax: 0, totalDiscount: 0, count: 0, items: 0, customers: [] };
    const returns = returnsData.find(r => r._id === period) || { totalReturns: 0, count: 0 };
    
    return {
      period,
      sales: {
        total: sales.totalSales,
        tax: sales.totalTax,
        discount: sales.totalDiscount,
        net: sales.totalSales - sales.totalDiscount,
        count: sales.count,
        items: sales.items,
        customers: sales.customers
      },
      returns: {
        total: returns.totalReturns,
        count: returns.count
      },
      netSales: sales.totalSales - returns.totalReturns
    };
  });
  
  // Calculate summary
  const summary = {
    totalSales: salesData.reduce((sum, s) => sum + s.totalSales, 0),
    totalReturns: returnsData.reduce((sum, r) => sum + r.totalReturns, 0),
    netSales: 0,
    totalTax: salesData.reduce((sum, s) => sum + s.totalTax, 0),
    totalDiscount: salesData.reduce((sum, s) => sum + s.totalDiscount, 0),
    totalOrders: salesData.reduce((sum, s) => sum + s.count, 0),
    totalItems: salesData.reduce((sum, s) => sum + s.items, 0),
    periods: report.length
  };
  
  summary.netSales = summary.totalSales - summary.totalReturns;
  summary.averageOrderValue = summary.totalOrders > 0 ? summary.totalSales / summary.totalOrders : 0;
  
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

// @desc    Get Top Selling Items
// @route   GET /api/v1/reports/sales/top-items
// @access  Private (accounts access)
exports.getTopSellingItems = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 10 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const topItems = await Sale.aggregate([
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

// @desc    Get Customer Sales Analysis
// @route   GET /api/v1/reports/sales/customer-analysis
// @access  Private (accounts access)
exports.getCustomerSalesAnalysis = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 10 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  const customerAnalysis = await Sale.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$customerId',
        totalSales: { $sum: '$grandTotal' },
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
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        customer: {
          name: '$customer.name',
          mobile: '$customer.mobile',
          email: '$customer.email'
        },
        totalSales: 1,
        totalOrders: 1,
        totalItems: 1,
        averageOrderValue: { $round: ['$averageOrderValue', 2] },
        firstOrderDate: 1,
        lastOrderDate: 1
      }
    },
    { $sort: { totalSales: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  res.status(200).json({
    success: true,
    data: customerAnalysis
  });
});

// @desc    Export Sales Report
// @route   GET /api/v1/reports/sales/export
// @access  Private (accounts access)
exports.exportSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get sales data (reuse getSalesReport logic)
  const { data } = await exports.getSalesReport(
    { query: { startDate, endDate } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sales_report_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Period,Total Sales,Tax,Discount,Net Sales,Orders,Items,Returns,Net Sales After Returns\n';
  
  data.report.forEach(row => {
    csv += `${row.period},${row.sales.total},${row.sales.tax},${row.sales.discount},${row.sales.net},${row.sales.count},${row.sales.items},${row.returns.total},${row.netSales}\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Total Sales,${data.summary.totalSales}\n`;
  csv += `Total Returns,${data.summary.totalReturns}\n`;
  csv += `Net Sales,${data.summary.netSales}\n`;
  csv += `Total Tax,${data.summary.totalTax}\n`;
  csv += `Total Discount,${data.summary.totalDiscount}\n`;
  csv += `Total Orders,${data.summary.totalOrders}\n`;
  csv += `Average Order Value,${data.summary.averageOrderValue.toFixed(2)}\n`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sales_report_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
