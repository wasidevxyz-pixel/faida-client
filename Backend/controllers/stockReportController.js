const asyncHandler = require('../middleware/async');
const Item = require('../models/Item');
const StockLog = require('../models/StockLog');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');

// @desc    Get Stock Summary Report
// @route   GET /api/v1/reports/stock
// @access  Private (accounts access)
exports.getStockReport = asyncHandler(async (req, res) => {
  const { categoryId, lowStock, outOfStock, groupBy = 'category' } = req.query;
  
  // Build filters
  let filters = { isActive: true };
  if (categoryId) filters.category = categoryId;
  if (lowStock === 'true') filters.stockQty = { $gt: 0, $lte: 10 };
  if (outOfStock === 'true') filters.stockQty = { $lte: 0 };
  
  // Get items with stock information
  const stockData = await Item.aggregate([
    { $match: filters },
    {
      $group: {
        _id: groupBy === 'category' ? '$category' : 'all',
        items: { $push: '$$ROOT' },
        totalItems: { $sum: 1 },
        totalStock: { $sum: '$stockQty' },
        totalValue: { $sum: { $multiply: ['$stockQty', '$salePrice'] } },
        lowStockCount: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$stockQty', 0] }, { $lte: ['$stockQty', 10] }] },
              1,
              0
            ]
          }
        },
        outOfStockCount: {
          $sum: {
            $cond: [{ $lte: ['$stockQty', 0] }, 1, 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Calculate overall summary
  const summary = {
    totalItems: stockData.reduce((sum, group) => sum + group.totalItems, 0),
    totalStock: stockData.reduce((sum, group) => sum + group.totalStock, 0),
    totalValue: stockData.reduce((sum, group) => sum + group.totalValue, 0),
    lowStockItems: stockData.reduce((sum, group) => sum + group.lowStockCount, 0),
    outOfStockItems: stockData.reduce((sum, group) => sum + group.outOfStockCount, 0),
    categories: stockData.length
  };
  
  res.status(200).json({
    success: true,
    data: {
      report: stockData,
      summary
    },
    meta: {
      groupBy,
      filters: { categoryId, lowStock, outOfStock },
      generatedAt: new Date()
    }
  });
});

// @desc    Get Stock Movement Report
// @route   GET /api/v1/reports/stock/movements
// @access  Private (accounts access)
exports.getStockMovementReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, itemId, type, groupBy = 'day' } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Build additional filters
  let filters = { ...dateFilter };
  if (itemId) filters.itemId = itemId;
  if (type) filters.type = type;
  
  // Get stock movements
  const movements = await StockLog.aggregate([
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
          type: '$type'
        },
        totalQuantity: { $sum: '$qty' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'items',
        localField: '_id.type',
        foreignField: '_id',
        as: 'item'
      }
    },
    {
      $group: {
        _id: '$_id.period',
        in: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'in'] }, '$totalQuantity', 0]
          }
        },
        out: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'out'] }, '$totalQuantity', 0]
          }
        },
        movements: {
          $push: {
            type: '$_id.type',
            quantity: '$totalQuantity',
            count: '$count'
          }
        }
      }
    },
    {
      $project: {
        period: '$_id',
        in: 1,
        out: 1,
        net: { $subtract: ['$in', '$out'] },
        movements: 1
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Calculate summary
  const summary = {
    totalIn: movements.reduce((sum, m) => sum + m.in, 0),
    totalOut: movements.reduce((sum, m) => sum + m.out, 0),
    netMovement: 0,
    periods: movements.length
  };
  
  summary.netMovement = summary.totalIn - summary.totalOut;
  
  res.status(200).json({
    success: true,
    data: {
      movements,
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

// @desc    Get Item-wise Stock Report
// @route   GET /api/v1/reports/stock/items
// @access  Private (accounts access)
exports.getItemStockReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 50 } = req.query;
  
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Get detailed item stock information
  const itemStockData = await Item.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: 'stocklogs',
        let: { itemId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$itemId', '$$itemId'] },
              ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
            }
          },
          {
            $group: {
              _id: '$type',
              totalQuantity: { $sum: '$qty' },
              count: { $sum: 1 }
            }
          }
        ],
        as: 'movements'
      }
    },
    {
      $addFields: {
        stockIn: {
          $let: {
            vars: { inMovement: { $filter: { input: '$movements', cond: { $eq: ['$$this._id', 'in'] } } } },
            in: { $arrayElemAt: ['$$inMovement.totalQuantity', 0] }
          }
        },
        stockOut: {
          $let: {
            vars: { outMovement: { $filter: { input: '$movements', cond: { $eq: ['$$this._id', 'out'] } } } },
            in: { $arrayElemAt: ['$$outMovement.totalQuantity', 0] }
          }
        }
      }
    },
    {
      $project: {
        name: 1,
        sku: 1,
        category: 1,
        stockQty: 1,
        purchasePrice: 1,
        salePrice: 1,
        stockValue: { $multiply: ['$stockQty', '$salePrice'] },
        stockIn: { $ifNull: ['$stockIn', 0] },
        stockOut: { $ifNull: ['$stockOut', 0] },
        netMovement: { $subtract: [{ $ifNull: ['$stockIn', 0] }, { $ifNull: ['$stockOut', 0] }] },
        movements: 1
      }
    },
    { $sort: { stockValue: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  // Calculate summary
  const summary = {
    totalItems: itemStockData.length,
    totalStock: itemStockData.reduce((sum, item) => sum + item.stockQty, 0),
    totalValue: itemStockData.reduce((sum, item) => sum + item.stockValue, 0),
    totalIn: itemStockData.reduce((sum, item) => sum + item.stockIn, 0),
    totalOut: itemStockData.reduce((sum, item) => sum + item.stockOut, 0)
  };
  
  summary.netMovement = summary.totalIn - summary.totalOut;
  
  res.status(200).json({
    success: true,
    data: {
      items: itemStockData,
      summary
    },
    meta: {
      limit,
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
      generatedAt: new Date()
    }
  });
});

// @desc    Get Low Stock Alert
// @route   GET /api/v1/reports/stock/low-stock
// @access  Private (accounts access)
exports.getLowStockAlert = asyncHandler(async (req, res) => {
  const { threshold = 10 } = req.query;
  
  const lowStockItems = await Item.find({
    isActive: true,
    stockQty: { $gt: 0, $lte: parseInt(threshold) }
  })
  .select('name sku category stockQty salePrice purchasePrice')
  .sort({ stockQty: 1 });
  
  const outOfStockItems = await Item.find({
    isActive: true,
    stockQty: { $lte: 0 }
  })
  .select('name sku category stockQty salePrice purchasePrice')
  .sort({ name: 1 });
  
  const alert = {
    lowStockItems: lowStockItems.map(item => ({
      ...item.toObject(),
      status: 'Low Stock',
      urgency: item.stockQty <= 5 ? 'Critical' : 'Warning'
    })),
    outOfStockItems: outOfStockItems.map(item => ({
      ...item.toObject(),
      status: 'Out of Stock',
      urgency: 'Critical'
    })),
    summary: {
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      totalAlerts: lowStockItems.length + outOfStockItems.length,
      threshold: parseInt(threshold)
    }
  };
  
  res.status(200).json({
    success: true,
    data: alert
  });
});

// @desc    Export Stock Report
// @route   GET /api/v1/reports/stock/export
// @access  Private (accounts access)
exports.exportStockReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  
  // Get stock data (reuse getItemStockReport logic)
  const { data } = await exports.getItemStockReport(
    { query: { startDate, endDate, limit: 1000 } },
    { json: (data) => ({ data }) },
    () => {}
  );
  
  if (format.toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="stock_report_${startDate || 'all'}_${endDate || 'all'}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  }
  
  // Default to CSV format
  let csv = 'Item Name,SKU,Category,Current Stock,Stock In,Stock Out,Net Movement,Stock Value\n';
  
  data.items.forEach(item => {
    csv += `"${item.name}","${item.sku}","${item.category}",${item.stockQty},${item.stockIn},${item.stockOut},${item.netMovement},${item.stockValue}\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Total Items,${data.summary.totalItems}\n`;
  csv += `Total Stock,${data.summary.totalStock}\n`;
  csv += `Total Value,${data.summary.totalValue}\n`;
  csv += `Total In,${data.summary.totalIn}\n`;
  csv += `Total Out,${data.summary.totalOut}\n`;
  csv += `Net Movement,${data.summary.netMovement}\n`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="stock_report_${startDate || 'all'}_${endDate || 'all'}.csv"`);
  res.send(csv);
});
