const CashSale = require('../models/CashSale');
const Purchase = require('../models/Purchase');
const { applyBranchFilter } = require('../middleware/auth');

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start, $lt: end };
}

function money(value) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(value || 0);
}

async function totalFor(req, Model, amountField, extraFilter = {}) {
  const query = await applyBranchFilter(req, { date: todayRange(), ...extraFilter }, Model);
  const result = await Model.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: `$${amountField}` }, count: { $sum: 1 } } }
  ]);
  return result[0] || { total: 0, count: 0 };
}

async function getTodaySales(req) {
  const data = await totalFor(req, CashSale, 'totalAmount');
  return {
    metric: 'today_sales',
    total: data.total,
    count: data.count,
    answer: `Today’s sales are ${money(data.total)} across ${data.count} cash sale${data.count === 1 ? '' : 's'}.`
  };
}

async function getTodayPurchases(req) {
  const data = await totalFor(req, Purchase, 'grandTotal', { status: { $nin: ['cancelled', 'returned'] } });
  return {
    metric: 'today_purchases',
    total: data.total,
    count: data.count,
    answer: `Today’s purchases are ${money(data.total)} across ${data.count} purchase${data.count === 1 ? '' : 's'}.`
  };
}

exports.getSummary = async (req, metric) => {
  if (metric === 'today_sales') return getTodaySales(req);
  if (metric === 'today_purchases') return getTodayPurchases(req);
  throw new Error('Unsupported AI business summary.');
};
