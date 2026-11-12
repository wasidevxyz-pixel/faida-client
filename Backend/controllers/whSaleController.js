const WHSale = require('../models/WHSale');
const WHItem = require('../models/WHItem');
const Item = require('../models/Item');
const WHCustomer = require('../models/WHCustomer');
const WHStockLog = require('../models/WHStockLog');
const mongoose = require('mongoose');
require('../models/WHItemClass');
require('../models/WHItemCompany');
const { addLedgerEntry, deleteLedgerEntry } = require('../utils/whLedgerUtils');

// Helper to populate missing item names and item classes from WHItem or retail Item collection
async function populateMissingItemNames(salesList) {
    if (!salesList || !salesList.length) return salesList;

    const barcodes = new Set();
    const itemIds = new Set();

    for (const sale of salesList) {
        if (!sale || !Array.isArray(sale.items)) continue;
        for (const line of sale.items) {
            const hasName = line.name || line.itemName || line.item?.name;
            const hasClass = line.className || (line.item && typeof line.item === 'object' && line.item.itemClass && (line.item.itemClass.name || typeof line.item.itemClass === 'string'));
            if (!hasName || !hasClass) {
                if (line.barcode) barcodes.add(line.barcode);
                if (line.item) {
                    const idStr = typeof line.item === 'object' ? (line.item._id ? String(line.item._id) : null) : String(line.item);
                    if (idStr) itemIds.add(idStr);
                }
            }
        }
    }

    const [whItemsByBarcode, whItemsById, itemsByBarcode, itemsById] = await Promise.all([
        barcodes.size > 0 ? WHItem.find({ barcode: { $in: Array.from(barcodes) } }, 'name barcode itemClass').populate('itemClass', 'name').lean() : [],
        itemIds.size > 0 ? WHItem.find({ _id: { $in: Array.from(itemIds) } }, 'name barcode itemClass').populate('itemClass', 'name').lean() : [],
        barcodes.size > 0 ? Item.find({ barcode: { $in: Array.from(barcodes) } }, 'name barcode class').populate('class', 'name').lean() : [],
        itemIds.size > 0 ? Item.find({ _id: { $in: Array.from(itemIds) } }, 'name barcode class').populate('class', 'name').lean() : []
    ]);

    const nameMap = {};
    const classMap = {};

    const registerItem = (it) => {
        if (!it) return;
        const name = it.name;
        const cName = it.itemClass?.name || it.class?.name || (typeof it.itemClass === 'string' ? it.itemClass : null) || (typeof it.class === 'string' ? it.class : null);
        if (it.barcode) {
            if (name && !nameMap[it.barcode]) nameMap[it.barcode] = name;
            if (cName && !classMap[it.barcode]) classMap[it.barcode] = cName;
        }
        if (it._id) {
            const idStr = String(it._id);
            if (name && !nameMap[idStr]) nameMap[idStr] = name;
            if (cName && !classMap[idStr]) classMap[idStr] = cName;
        }
    };

    whItemsByBarcode.forEach(registerItem);
    whItemsById.forEach(registerItem);
    itemsByBarcode.forEach(registerItem);
    itemsById.forEach(registerItem);

    for (const sale of salesList) {
        if (!sale || !Array.isArray(sale.items)) continue;
        for (const line of sale.items) {
            const qty = parseFloat(line.quantity || 0);
            const rate = parseFloat(line.pcsPrice || line.rate || 0);
            const discAmt = parseFloat(line.discountAmount || line.disRs || 0);
            const sub = qty * rate;

            if (line.discountPercent !== undefined && line.discountPercent !== null && parseFloat(line.discountPercent) > 0) {
                line.discountPercent = Math.round((parseFloat(line.discountPercent) || 0) * 100) / 100;
            } else if (discAmt > 0 && sub > 0) {
                line.discountPercent = Math.round(((discAmt / sub) * 100) * 100) / 100;
            }
            const idStr = line.item ? (typeof line.item === 'object' ? String(line.item._id || '') : String(line.item)) : '';
            const currentName = line.name || line.itemName || line.item?.name;
            if (!currentName) {
                const resolved = (line.barcode && nameMap[line.barcode]) || (idStr && nameMap[idStr]);
                if (resolved) {
                    line.name = resolved;
                    line.itemName = resolved;
                    if (line.item && typeof line.item === 'object') {
                        line.item.name = resolved;
                    }
                }
            } else {
                if (!line.name && currentName) line.name = currentName;
                if (!line.itemName && currentName) line.itemName = currentName;
            }

            // Populate and normalize Item Class Name
            const existingClass = line.className || (line.item && typeof line.item === 'object' && line.item.itemClass && (line.item.itemClass.name || (typeof line.item.itemClass === 'string' ? line.item.itemClass : null)));
            const resolvedClass = existingClass || (line.barcode && classMap[line.barcode]) || (idStr && classMap[idStr]) || 'General Products';
            line.className = resolvedClass;
            if (line.item && typeof line.item === 'object') {
                if (!line.item.itemClass) {
                    line.item.itemClass = { name: resolvedClass };
                } else if (typeof line.item.itemClass === 'object' && !line.item.itemClass.name) {
                    line.item.itemClass.name = resolvedClass;
                }
            }
        }
    }

    return salesList;
}


// Helper to resolve and persist className & itemClass directly on each line item
async function attachClassInfoToItems(items) {
    if (!Array.isArray(items) || items.length === 0) return items;
    const missingIds = items
        .filter(it => !it.className && it.item)
        .map(it => typeof it.item === 'object' ? String(it.item._id || it.item) : String(it.item));

    let classLookup = {};
    if (missingIds.length > 0) {
        const whItems = await WHItem.find({ _id: { $in: missingIds } }, 'itemClass').populate('itemClass', 'name').lean();
        for (const whi of whItems) {
            const cName = whi.itemClass?.name || (typeof whi.itemClass === 'string' ? whi.itemClass : null);
            if (cName) classLookup[String(whi._id)] = { itemClass: whi.itemClass, className: cName };
        }
    }

    return items.map(it => {
        const itId = it.item ? (typeof it.item === 'object' ? String(it.item._id || '') : String(it.item)) : '';
        const fallback = classLookup[itId] || {};
        const className = it.className || it.itemClass?.name || fallback.className || (typeof it.itemClass === 'string' ? it.itemClass : null) || 'General Products';
        const itemClass = it.itemClass || fallback.itemClass || null;
        return {
            ...it,
            className,
            itemClass,
            discountPercent: Math.round((parseFloat(it.discountPercent ?? it.disP ?? 0)) * 100) / 100
        };
    });
}

// Helper to execute operations within a transaction if replica set is available, or directly if standalone MongoDB
async function executeWithOptionalSession(work) {
    let session = null;
    try {
        session = await mongoose.startSession();
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } catch (err) {
        // If MongoDB is standalone (not replica set or mongos), fall back to direct execution
        if (err.message && (err.message.includes('replica set member or mongos') || err.message.includes('Transaction numbers are only allowed'))) {
            return await work(null);
        }
        throw err;
    } finally {
        if (session) {
            try { await session.endSession(); } catch (_) {}
        }
    }
}

// @desc    Create new WH Sale
// @route   POST /api/v1/wh-sales
exports.createWHSale = async (req, res) => {
    try {
        const saleData = {
            ...req.body,
            createdBy: req.user ? req.user._id : null
        };

        if (Array.isArray(saleData.items)) {
            saleData.items = await attachClassInfoToItems(saleData.items);
        }

        let sale;
        await executeWithOptionalSession(async (session) => {
            const isPosted = String(saleData.status || '').trim().toLowerCase() === 'posted';
            const requestedQtyByItem = {};
            if (isPosted) {
                saleData.items.forEach(line => {
                    const itemId = line.item ? (typeof line.item === 'object' ? String(line.item._id || line.item) : String(line.item)) : '';
                    if (itemId) {
                        requestedQtyByItem[itemId] = (requestedQtyByItem[itemId] || 0) + (parseFloat(line.quantity) || 0);
                    }
                });
            }

            const stockChanges = [];
            for (const itemId of Object.keys(requestedQtyByItem)) {
                const whItem = session ? await WHItem.findById(itemId).session(session) : await WHItem.findById(itemId);
                if (!whItem) throw new Error(`Item not found: ${itemId}`);
                const previousQty = whItem.stock?.length ? whItem.stock[0].quantity : 0;
                const saleQty = requestedQtyByItem[itemId];
                const newQty = previousQty - saleQty;
                if (newQty < 0) {
                    throw new Error(`Insufficient stock for item: ${whItem.name}. Available: ${previousQty}, Sale: ${saleQty}`);
                }
                stockChanges.push({ whItem, previousQty, saleQty, newQty });
            }

            if (session) {
                [sale] = await WHSale.create([saleData], { session });
            } else {
                sale = await WHSale.create(saleData);
            }

            for (const change of stockChanges) {
                const { whItem, previousQty, saleQty, newQty } = change;
                if (whItem.stock?.length) whItem.stock[0].quantity = newQty;
                else whItem.stock = [{ quantity: newQty, opening: 0 }];
                whItem.markModified('stock');
                await whItem.save(session ? { session } : {});

                const logData = {
                    item: whItem._id, date: sale.invoiceDate, type: 'out',
                    qty: saleQty, previousQty, newQty, refType: 'sale',
                    refId: sale._id, remarks: `Sale #${sale.invoiceNo}`,
                    createdBy: req.user ? req.user._id : null
                };
                if (session) {
                    await WHStockLog.create([logData], { session });
                } else {
                    await WHStockLog.create(logData);
                }
            }

            if (isPosted) {
                await addLedgerEntry({
                    customer: sale.customer,
                    date: sale.invoiceDate,
                    description: `Credit Sale - Invoice #${sale.invoiceNo}`,
                    refType: 'Sale',
                    refId: sale._id,
                    debit: sale.netTotal,
                    credit: ['Cash', 'Bank'].includes(sale.payMode) ? sale.paidAmount : 0,
                    createdBy: req.user ? req.user._id : null,
                    session
                });
            }
        });

        const saved = await WHSale.findById(sale._id)
            .populate('customer', 'customerName name phone address code')
            .lean();
        if (saved) {
            await populateMissingCustomerNames([saved]);
        }

        res.status(201).json({ success: true, data: saved || sale });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
};

// Helper to ensure customer name is populated and normalized on all sales
async function populateMissingCustomerNames(salesList) {
    if (!salesList || !salesList.length) return salesList;

    const unpopulatedCustomerIds = new Set();
    for (const sale of salesList) {
        if (!sale) continue;
        if (!sale.customer || typeof sale.customer !== 'object' || (!sale.customer.customerName && !sale.customer.name)) {
            const cId = sale.customer && typeof sale.customer === 'object' ? (sale.customer._id ? String(sale.customer._id) : null) : (sale.customer ? String(sale.customer) : null);
            if (cId) unpopulatedCustomerIds.add(cId);
        }
    }

    let customerMap = {};
    if (unpopulatedCustomerIds.size > 0) {
        const foundCustomers = await WHCustomer.find({ _id: { $in: Array.from(unpopulatedCustomerIds) } }, 'customerName name phone address code customerCategory').lean();
        for (const c of foundCustomers) {
            const resolvedName = c.customerName || c.name || '';
            customerMap[String(c._id)] = {
                _id: c._id,
                customerName: resolvedName,
                name: resolvedName,
                phone: c.phone || '',
                address: c.address || '',
                code: c.code || '',
                customerCategory: c.customerCategory || null
            };
        }
    }

    for (const sale of salesList) {
        if (!sale) continue;
        const cId = sale.customer && typeof sale.customer === 'object' ? String(sale.customer._id || '') : (sale.customer ? String(sale.customer) : '');
        if (sale.customer && typeof sale.customer === 'object' && (sale.customer.customerName || sale.customer.name)) {
            const resolvedName = sale.customer.customerName || sale.customer.name || '';
            sale.customer.name = resolvedName;
            sale.customer.customerName = resolvedName;
            sale.customerName = resolvedName;
        } else if (cId && customerMap[cId]) {
            sale.customer = customerMap[cId];
            sale.customerName = customerMap[cId].name;
        } else if (sale.customerName) {
            if (!sale.customer || typeof sale.customer !== 'object') {
                sale.customer = { name: sale.customerName, customerName: sale.customerName };
            } else {
                sale.customer.name = sale.customerName;
                sale.customer.customerName = sale.customerName;
            }
        }
    }

    return salesList;
}

// @desc    Get all WH Sales
// @route   GET /api/v1/wh-sales
exports.getWHSales = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;
        let query = {};

        // Date Filtering
        if (startDate || endDate) {
            query.invoiceDate = {};
            if (startDate) {
                const sDate = new Date(startDate);
                sDate.setHours(0, 0, 0, 0);
                query.invoiceDate.$gte = sDate;
            }
            if (endDate) {
                const eDate = new Date(endDate);
                eDate.setHours(23, 59, 59, 999);
                query.invoiceDate.$lte = eDate;
            }
        }

        // Fetch all matching date range first with populated customer and line items
        let sales = await WHSale.find(query)
            .populate('customer', 'customerName name customerCategory contactPerson phone address code')
            .populate('createdBy', 'name')
            .populate({
                path: 'items.item',
                select: 'name barcode salePrice retailPrice itemClass company',
                populate: [
                    { path: 'itemClass', select: 'name' },
                    { path: 'company', select: 'name' }
                ]
            })
            .sort({ invoiceDate: -1, createdAt: -1 })
            .lean();

        // Ensure customer names and line items are populated & normalized
        sales = await populateMissingCustomerNames(sales);
        sales = await populateMissingItemNames(sales);

        // In-memory Search Filtering
        if (search) {
            const searchLower = search.toLowerCase();
            sales = sales.filter(sale =>
                (sale.invoiceNo && sale.invoiceNo.toLowerCase().includes(searchLower)) ||
                (sale.remarks && sale.remarks.toLowerCase().includes(searchLower)) ||
                (sale.customer && ((sale.customer.customerName && sale.customer.customerName.toLowerCase().includes(searchLower)) || (sale.customer.name && sale.customer.name.toLowerCase().includes(searchLower)))) ||
                (sale.customerName && sale.customerName.toLowerCase().includes(searchLower))
            );
        }

        res.status(200).json({ success: true, count: sales.length, data: sales });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get single WH Sale
// @route   GET /api/v1/wh-sales/:id
exports.getWHSale = async (req, res) => {
    try {
        let sale = await WHSale.findById(req.params.id)
            .populate('customer')
            .populate({
                path: 'items.item',
                populate: [
                    { path: 'itemClass' },
                    { path: 'company' }
                ]
            })
            .populate('whCategory')
            .lean();
        if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

        await populateMissingCustomerNames([sale]);
        await populateMissingItemNames([sale]);

        res.status(200).json({ success: true, data: sale });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update WH Sale
// @route   PUT /api/v1/wh-sales/:id
exports.updateWHSale = async (req, res) => {
    try {
        let updatedSale;
        await executeWithOptionalSession(async (session) => {
            let sale = session ? await WHSale.findById(req.params.id).session(session) : await WHSale.findById(req.params.id);
            if (!sale) {
                const error = new Error('Sale not found');
                error.statusCode = 404;
                throw error;
            }

            const existingStatus = sale.status;
            const isExistingPosted = String(existingStatus || '').trim().toLowerCase() === 'posted';
            const isRequestedPosted = String(req.body.status || '').trim().toLowerCase() === 'posted';
            const isRequestedDraft = String(req.body.status || '').trim().toLowerCase() === 'draft';

            const oldItems = JSON.parse(JSON.stringify(sale.items));
            if (Array.isArray(req.body.items)) {
                req.body.items = await attachClassInfoToItems(req.body.items);
            }

            const requestedItems = Array.isArray(req.body.items) ? req.body.items : sale.items;
            const itemMap = {};
            const addItems = (items, multiplier) => items.forEach(item => {
                const id = item.item ? (typeof item.item === 'object' ? String(item.item._id || item.item) : String(item.item)) : '';
                if (id) {
                    itemMap[id] = (itemMap[id] || 0) + multiplier * (parseFloat(item.quantity) || 0);
                }
            });

            if (isExistingPosted) addItems(oldItems, -1);
            if (isRequestedPosted || (isExistingPosted && !isRequestedDraft)) {
                addItems(requestedItems, 1);
            }

            const stockChanges = [];
            for (const itemId of Object.keys(itemMap)) {
                const netQty = itemMap[itemId];
                if (netQty === 0) continue;
                const whItem = session ? await WHItem.findById(itemId).session(session) : await WHItem.findById(itemId);
                if (!whItem) throw new Error(`Item not found: ${itemId}`);
                const previousQty = whItem.stock?.length ? whItem.stock[0].quantity : 0;
                const logType = netQty > 0 ? 'out' : 'in';
                const qty = Math.abs(netQty);
                const newQty = logType === 'out' ? previousQty - qty : previousQty + qty;
                if (newQty < 0) {
                    throw new Error(`Insufficient stock for item: ${whItem.name}. Available: ${previousQty}, Request Net: ${qty}`);
                }
                stockChanges.push({ whItem, previousQty, newQty, logType, qty });
            }

            sale = await WHSale.findByIdAndUpdate(req.params.id, req.body, {
                returnDocument: 'after',
                runValidators: true,
                ...(session ? { session } : {})
            });

            for (const change of stockChanges) {
                const { whItem, previousQty, newQty, logType, qty } = change;
                if (whItem.stock?.length) whItem.stock[0].quantity = newQty;
                else whItem.stock = [{ quantity: newQty, opening: 0 }];
                whItem.markModified('stock');
                await whItem.save(session ? { session } : {});
                const logData = {
                    item: whItem._id, date: sale.invoiceDate, type: logType, qty,
                    previousQty, newQty, refType: 'sale', refId: sale._id,
                    remarks: `Updated Sale #${sale.invoiceNo} (Net Change)`,
                    createdBy: req.user ? req.user._id : null
                };
                if (session) {
                    await WHStockLog.create([logData], { session });
                } else {
                    await WHStockLog.create(logData);
                }
            }

            if (isExistingPosted) {
                await deleteLedgerEntry(sale._id, {
                    customer: sale.customer,
                    debit: sale.netTotal,
                    credit: ['Cash', 'Bank'].includes(sale.payMode) ? sale.paidAmount : 0
                }, session);
            }
            if (isRequestedPosted || String(sale.status || '').trim().toLowerCase() === 'posted') {
                await addLedgerEntry({
                    customer: sale.customer, date: sale.invoiceDate,
                    description: `Credit Sale (Updated) - Invoice #${sale.invoiceNo}`,
                    refType: 'Sale', refId: sale._id, debit: sale.netTotal,
                    credit: ['Cash', 'Bank'].includes(sale.payMode) ? sale.paidAmount : 0,
                    createdBy: req.user ? req.user._id : null, session
                });
            }
            updatedSale = sale;
        });
        res.status(200).json({ success: true, data: updatedSale });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
};

// @desc    Delete WH Sale
// @route   DELETE /api/v1/wh-sales/:id
exports.deleteWHSale = async (req, res) => {
    try {
        const sale = await WHSale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

        const isPosted = String(sale.status || '').trim().toLowerCase() === 'posted';
        if (isPosted) {
            for (const line of sale.items) {
                const itemId = line.item ? (typeof line.item === 'object' ? String(line.item._id || line.item) : String(line.item)) : '';
                const whItem = itemId ? await WHItem.findById(itemId) : null;
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const saleQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty + saleQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: sale.invoiceDate,
                        type: 'in',
                        qty: saleQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'sale',
                        refId: sale._id,
                        remarks: `DELETED: Sale #${sale.invoiceNo} (REVERSED)`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
            await deleteLedgerEntry(sale._id, {
                customer: sale.customer,
                debit: sale.netTotal,
                credit: (sale.payMode === 'Cash' || sale.payMode === 'Bank') ? sale.paidAmount : 0
            });
        }

        await sale.deleteOne();
        res.status(200).json({ success: true, message: 'Sale deleted and stock reversed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get next invoice number
// @route   GET /api/v1/wh-sales/next-number
exports.getNextInvoiceNumber = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const count = await WHSale.countDocuments({
            createdAt: { $gte: startOfYear, $lt: endOfYear }
        });

        const nextNo = `INV-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        res.status(200).json({ success: true, data: nextNo, nextInvoiceNo: nextNo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
