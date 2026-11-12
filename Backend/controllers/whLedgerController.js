const WHLedger = require('../models/WHLedger');
const WHCustomer = require('../models/WHCustomer');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');

// @desc    Get WH Customer Ledger Report
// @route   GET /api/v1/wh-ledger/report
// @access  Private
exports.getWHLedgerReport = asyncHandler(async (req, res) => {
    const { customer, from, to } = req.query;

    if (!customer) {
        return res.status(400).json({ success: false, error: 'Customer ID is required' });
    }

    let query = { customer };

    if (from && to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);

        query.date = {
            $gte: new Date(from),
            $lte: toDate
        };
    }

    // Get transactions
    const ledgerEntries = await WHLedger.find(query).sort({ date: 1, createdAt: 1 });

    // Calculate Opening Balance (sum of all transactions before 'from' date)
    let openingBalance = 0;
    if (from) {
        const previousEntries = await WHLedger.find({
            customer,
            date: { $lt: new Date(from) }
        });
        openingBalance = previousEntries.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);
    }

    res.status(200).json({
        success: true,
        data: {
            openingBalance,
            entries: ledgerEntries
        }
    });
});

// @desc    Get WH Customer Balance Report (Summary)
// @route   GET /api/v1/wh-ledger/balances
// @access  Private
exports.getWHCustomerBalances = asyncHandler(async (req, res) => {
    const { category, balanceOnly } = req.query;

    let query = {};
    if (category) {
        query.customerCategory = category;
    }

    const customers = await WHCustomer.find(query)
        .populate('customerCategory', 'name')
        .sort({ customerName: 1 });

    let data = customers.map(c => ({
        _id: c._id,
        customerName: c.customerName,
        code: c.code,
        phone: c.phone || '',
        balance: c.currentBalance || 0,
        categoryId: c.customerCategory ? c.customerCategory._id : null,
        categoryName: c.customerCategory ? c.customerCategory.name : ''
    }));

    // Filter to show only customers with balance if requested
    if (balanceOnly === 'true') {
        data = data.filter(c => c.balance !== 0);
    }

    res.status(200).json({
        success: true,
        count: data.length,
        data
    });
});

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get WH Item Stock Position Report
// @route   GET /api/v1/wh-ledger/stock-position
// @access  Private
exports.getWHStockPosition = asyncHandler(async (req, res) => {
    const { company, category, itemClass, subClass, supplier, criteria, search } = req.query;

    let query = {};

    // Apply basic filters
    if (company) query.company = company;
    if (category) query.category = category;
    const finalItemClass = itemClass || req.query.class;
    if (finalItemClass) query.itemClass = finalItemClass;
    if (subClass) query.subClass = subClass;
    if (supplier) query.supplier = supplier;

    if (search && String(search).trim()) {
        const trimmedSearch = String(search).trim();
        const escaped = escapeRegex(trimmedSearch);
        const words = trimmedSearch.split(/\s+/).filter(Boolean).map(escapeRegex);
        const multiWordPattern = words.join('.*');

        query.$or = [
            { itemsCode: { $regex: escaped, $options: 'i' } },
            { barcode: { $regex: escaped, $options: 'i' } },
            { name: { $regex: escaped, $options: 'i' } },
            { name: { $regex: multiWordPattern, $options: 'i' } }
        ];
    }

    // Filter inactive items
    query.isActive = { $ne: false };

    // Fetch items with populated relations
    let items = await WHItem.find(query)
        .populate('company', 'name')
        .populate('category', 'name')
        .populate('itemClass', 'name')
        .populate('subClass', 'name')
        .sort({ seqId: 1, name: 1 });

    // Process items to calculate total stock and apply criteria
    let data = items.map(item => {
        const currentStock = (item.stock || []).reduce((acc, curr) => acc + (curr.quantity || 0), 0);
        return {
            _id: item._id,
            seqId: item.seqId,
            code: item.barcode || item.itemsCode, // Show barcode if available, otherwise itemsCode
            itemsCode: item.itemsCode,
            barcode: item.barcode || '',
            name: item.name,
            company: item.company,
            category: item.category,
            itemClass: item.itemClass,
            subClass: item.subClass,
            costPrice: item.costPrice || 0,
            salePrice: item.salePrice || 0,
            retailPrice: item.retailPrice || 0,
            incentive: item.incentive || 0,
            currentStock: currentStock
        };
    });

    // Apply Stock Criteria filter
    if (criteria === 'zero') {
        data = data.filter(item => item.currentStock === 0);
    } else if (criteria === 'greater') {
        data = data.filter(item => item.currentStock > 0);
    } else if (criteria === 'less') {
        data = data.filter(item => item.currentStock < 0);
    } else if (criteria === 'incentive') {
        data = data.filter(item => (item.incentive || 0) > 0);
    }

    res.status(200).json({
        success: true,
        count: data.length,
        data
    });
});

// @desc    Get WH Item Ledger Report
// @route   GET /api/v1/wh-ledger/item-ledger
// @access  Private
exports.getWHItemLedger = asyncHandler(async (req, res) => {
    const { item, from, to } = req.query;

    if (!item) {
        return res.status(400).json({ success: false, error: 'Item ID is required' });
    }

    const itemDoc = await WHItem.findById(item);
    if (!itemDoc) {
        return res.status(404).json({ success: false, error: 'Item not found' });
    }

    let query = { item };

    if (from && to) {
        // Set 'to' to end of day to include all transactions on that date
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);

        query.date = {
            $gte: new Date(from),
            $lte: toDate
        };
    }

    // Get logs for the period
    const logs = await WHStockLog.find(query).sort({ date: 1, createdAt: 1 });

    // Calculate Opening Stock for the period
    let openingBalance = 0;
    if (from) {
        const lastLogBefore = await WHStockLog.findOne({
            item,
            date: { $lt: new Date(from) }
        }).sort({ date: -1, createdAt: -1 });

        if (lastLogBefore) {
            openingBalance = lastLogBefore.newQty;
        } else {
            // Check if there are ANY logs at all for this item
            // If logs exist (even after 'from'), it means the stock started from 0 in logs
            const anyLog = await WHStockLog.findOne({ item });
            if (anyLog) {
                openingBalance = 0;
            } else {
                openingBalance = itemDoc.stock && itemDoc.stock.length > 0 ? itemDoc.stock[0].opening : 0;
            }
        }
    } else {
        const anyLog = await WHStockLog.findOne({ item });
        openingBalance = anyLog ? 0 : (itemDoc.stock && itemDoc.stock.length > 0 ? itemDoc.stock[0].opening : 0);
    }

    // --- Fetch Details to Append Names ---
    const WHPurchase = require('../models/WHPurchase');
    const WHSale = require('../models/WHSale');
    const WHPurchaseReturn = require('../models/WHPurchaseReturn');
    const WHSaleReturn = require('../models/WHSaleReturn');

    // Collect IDs
    const purchaseIds = [];
    const saleIds = [];
    const purchaseReturnIds = [];
    const saleReturnIds = [];

    logs.forEach(l => {
        if (l.refType === 'purchase') purchaseIds.push(l.refId);
        else if (l.refType === 'sale') saleIds.push(l.refId);
        else if (l.refType === 'purchase_return') purchaseReturnIds.push(l.refId);
        else if (l.refType === 'sales_return') saleReturnIds.push(l.refId);
    });

    // Fetch Docs
    const purchases = await WHPurchase.find({ _id: { $in: purchaseIds } }).populate('supplier', 'supplierName');
    const sales = await WHSale.find({ _id: { $in: saleIds } }).populate('customer', 'customerName');
    const purchaseReturns = await WHPurchaseReturn.find({ _id: { $in: purchaseReturnIds } }).populate('supplier', 'supplierName');
    const saleReturns = await WHSaleReturn.find({ _id: { $in: saleReturnIds } }).populate('customer', 'customerName');

    // Create Map
    const nameMap = {}; // refId -> Name
    purchases.forEach(p => { if (p.supplier) nameMap[p._id.toString()] = ' - ' + p.supplier.supplierName; });
    sales.forEach(s => { if (s.customer) nameMap[s._id.toString()] = ' - ' + s.customer.customerName; });
    purchaseReturns.forEach(p => { if (p.supplier) nameMap[p._id.toString()] = ' - ' + p.supplier.supplierName; });
    saleReturns.forEach(s => { if (s.customer) nameMap[s._id.toString()] = ' - ' + s.customer.customerName; });

    // Filter out technical update logs that cancel each other out
    const filteredEntries = [];
    const entries = logs.map(l => {
        let suffix = '';
        if (l.refId && nameMap[l.refId.toString()]) {
            suffix = nameMap[l.refId.toString()];
        }
        return {
            date: l.date,
            refId: l.refId,
            refType: l.refType,
            description: (l.remarks || l.refType) + suffix,
            quantity: Math.abs(l.qty),
            type: (l.type === 'in' || (l.type === 'audit' && l.qty > 0)) ? 'in' : 'out',
            previousQty: l.previousQty,
            newQty: l.newQty,
            createdAt: l.createdAt
        };
    });

    // Strategy: Look for entries with same refId, same quantity, one IN, one OUT, created very close to each other
    for (let i = 0; i < entries.length; i++) {
        const current = entries[i];
        let isTechnical = false;

        // Only check "Update" or "REVERSED" logs
        if (current.description.toLowerCase().includes('update') || current.description.toLowerCase().includes('reversed')) {
            for (let j = 0; j < entries.length; j++) {
                if (i === j) continue;
                const other = entries[j];

                if (current.refId && other.refId &&
                    current.refId.toString() === other.refId.toString() &&
                    current.quantity === other.quantity &&
                    current.type !== other.type) {

                    const timeDiff = Math.abs(new Date(current.createdAt) - new Date(other.createdAt));
                    if (timeDiff < 5000) { // If within 5 seconds
                        isTechnical = true;
                        break;
                    }
                }
            }
        }

        if (!isTechnical) {
            filteredEntries.push(current);
        }
    }

    res.status(200).json({
        success: true,
        data: {
            openingBalance,
            entries: filteredEntries
        }
    });
});

// @desc    Set WH Item stock and append an adjustment to its ledger
// @route   POST /api/v1/wh-ledger/item-ledger/adjust
// @access  Private (admin or wh_stock_audit)
exports.adjustWHItemStock = asyncHandler(async (req, res) => {
    const { item: itemId, quantity, expectedCurrentQty, reason } = req.body;

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
        return res.status(400).json({ success: false, message: 'A valid item ID is required' });
    }

    const targetQty = quantity;
    const expectedQty = expectedCurrentQty;
    const adjustmentReason = typeof reason === 'string' ? reason.trim() : '';

    if (typeof targetQty !== 'number' || !Number.isFinite(targetQty) || targetQty < 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a non-negative number' });
    }
    if (typeof expectedQty !== 'number' || !Number.isFinite(expectedQty)) {
        return res.status(400).json({ success: false, message: 'Current quantity is invalid; reload the item and try again' });
    }
    if (!adjustmentReason || adjustmentReason.length > 250) {
        return res.status(400).json({ success: false, message: 'Enter an adjustment reason of up to 250 characters' });
    }

    const itemDoc = await WHItem.findById(itemId);
    if (!itemDoc) {
        return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (req.user.role !== 'admin') {
        const allowedCategories = req.user.allowedWHItemCategories || [];
        if (!allowedCategories.some(category => category.toString() === itemDoc.category.toString())) {
            return res.status(403).json({ success: false, message: 'You are not authorized to adjust stock for this item' });
        }
    }

    const hasStockEntry = Boolean(itemDoc.stock && itemDoc.stock.length);
    const previousQty = hasStockEntry ? Number(itemDoc.stock[0].quantity) : 0;

    if (previousQty !== expectedQty) {
        return res.status(409).json({
            success: false,
            message: `Stock changed since you selected this item. Current quantity is ${previousQty}; reload and try again.`
        });
    }
    if (previousQty === targetQty) {
        return res.status(400).json({ success: false, message: 'The new quantity is the same as the current quantity' });
    }

    const stockCondition = hasStockEntry
        ? { 'stock.0.quantity': previousQty }
        : {
            $or: [
                { stock: { $exists: false } },
                { stock: { $size: 0 } }
            ]
        };
    const update = hasStockEntry
        ? { $set: { 'stock.0.quantity': targetQty } }
        : { $set: { stock: [{ quantity: targetQty, opening: 0 }] } };

    const updatedItem = await WHItem.findOneAndUpdate(
        { _id: itemDoc._id, ...stockCondition },
        update,
        { new: true, runValidators: true }
    );

    if (!updatedItem) {
        return res.status(409).json({
            success: false,
            message: 'Stock changed while saving. Reload the item and try again.'
        });
    }

    try {
        await WHStockLog.create({
            item: updatedItem._id,
            date: new Date(),
            type: targetQty > previousQty ? 'in' : 'out',
            qty: Math.abs(targetQty - previousQty),
            previousQty,
            newQty: targetQty,
            refType: 'audit',
            refId: updatedItem._id,
            remarks: `Manual stock adjustment: ${adjustmentReason}`,
            createdBy: req.user._id
        });
    } catch (logError) {
        const rollback = hasStockEntry
            ? { $set: { 'stock.0.quantity': previousQty } }
            : { $set: { stock: [] } };
        let rolledBackItem;
        try {
            rolledBackItem = await WHItem.findOneAndUpdate(
                { _id: updatedItem._id, 'stock.0.quantity': targetQty },
                rollback,
                { new: true }
            );
        } catch (rollbackError) {
            console.error('WH stock adjustment audit and rollback both failed:', {
                itemId: updatedItem._id.toString(),
                logError: logError.message,
                rollbackError: rollbackError.message
            });
            return res.status(500).json({
                success: false,
                message: 'The stock changed but its audit record could not be saved, and rollback failed. Contact an administrator immediately.'
            });
        }

        if (!rolledBackItem) {
            console.error('WH stock adjustment audit failed and stock rollback did not match the updated quantity:', {
                itemId: updatedItem._id.toString(),
                logError: logError.message
            });
            return res.status(500).json({
                success: false,
                message: 'The stock changed but its audit record could not be saved, and automatic rollback was not possible. Contact an administrator immediately.'
            });
        }

        console.error('WH stock adjustment audit failed; stock change was rolled back:', logError);
        return res.status(500).json({
            success: false,
            message: 'Could not save the adjustment history. The stock change was rolled back; please try again.'
        });
    }

    res.status(200).json({
        success: true,
        message: `Stock adjusted from ${previousQty} to ${targetQty}. Previous ledger history was retained.`,
        data: { previousQty, quantity: targetQty }
    });
});

// @desc    Get WH Stock Activity Report
// @route   GET /api/v1/wh-ledger/stock-activity
// @access  Private
exports.getWHStockActivity = asyncHandler(async (req, res) => {
    const { from, to, criteria, search, category, itemClass, subClass } = req.query;

    let itemQuery = { isActive: { $ne: false } };
    if (category) {
        itemQuery.category = category;
    }
    const finalItemClass = itemClass || req.query.class;
    if (finalItemClass) {
        itemQuery.itemClass = finalItemClass;
    }
    if (subClass) {
        itemQuery.subClass = subClass;
    }
    if (search && String(search).trim()) {
        const trimmedSearch = String(search).trim();
        const escaped = escapeRegex(trimmedSearch);
        const words = trimmedSearch.split(/\s+/).filter(Boolean).map(escapeRegex);
        itemQuery.$or = [
            { itemsCode: { $regex: escaped, $options: 'i' } },
            { barcode: { $regex: escaped, $options: 'i' } },
            { name: { $regex: escaped, $options: 'i' } },
            { name: { $regex: words.join('.*'), $options: 'i' } }
        ];
    }

    const items = await WHItem.find(itemQuery).populate('category', 'name').populate('itemClass', 'name').populate('subClass', 'name').sort({ seqId: 1, name: 1 });
    const WHStockLog = require('../models/WHStockLog');

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const reportData = [];

    for (const item of items) {
        // Calculate Opening (Balance before 'from' date)
        let opening = 0;
        const lastLogBefore = await WHStockLog.findOne({
            item: item._id,
            date: { $lt: fromDate }
        }).sort({ date: -1, createdAt: -1 });

        if (lastLogBefore) {
            opening = lastLogBefore.newQty;
        } else {
            const anyLog = await WHStockLog.findOne({ item: item._id });
            if (anyLog) {
                opening = 0;
            } else {
                opening = item.stock && item.stock.length > 0 ? item.stock[0].opening : 0;
            }
        }

        // Get activities in range
        const logsInRange = await WHStockLog.find({
            item: item._id,
            date: { $gte: fromDate, $lte: toDate }
        });

        const purchases = logsInRange.filter(l => l.refType === 'purchase').reduce((acc, curr) => {
            return acc + (curr.type === 'in' ? curr.qty : -curr.qty);
        }, 0);
        const sales = logsInRange.filter(l => l.refType === 'sale').reduce((acc, curr) => {
            return acc + (curr.type === 'out' ? curr.qty : -curr.qty);
        }, 0);
        const salesReturns = logsInRange.filter(l => l.refType === 'sales_return').reduce((acc, curr) => {
            return acc + (curr.type === 'in' ? curr.qty : -curr.qty);
        }, 0);
        const purchaseReturns = logsInRange.filter(l => l.refType === 'purchase_return').reduce((acc, curr) => {
            return acc + (curr.type === 'out' ? curr.qty : -curr.qty);
        }, 0);
        const adjustments = logsInRange.filter(l => l.refType === 'audit').reduce((acc, curr) => {
            if (curr.type === 'in') return acc + curr.qty;
            if (curr.type === 'out') return acc - curr.qty;
            return acc + curr.qty; // Fallback for legacy 'audit' type logs where qty held the sign
        }, 0);

        const netReturns = salesReturns - purchaseReturns;
        const closing = opening + purchases - sales + netReturns + adjustments;

        // Apply filters (skip if searching specific item)
        if (!search) {
            if (criteria === 'active' && purchases === 0 && sales === 0 && netReturns === 0 && adjustments === 0 && opening === 0) continue;
            if (criteria === 'zero_stock' && closing !== 0) continue;
            if (criteria === 'non_zero' && closing === 0) continue;
        }

        reportData.push({
            _id: item._id,
            name: item.name,
            code: item.itemsCode,
            category: item.category,
            subClass: item.subClass,
            opening,
            purchases,
            sales,
            returns: netReturns,
            adjustments,
            closing
        });
    }

    res.status(200).json({
        success: true,
        count: reportData.length,
        data: reportData
    });
});
