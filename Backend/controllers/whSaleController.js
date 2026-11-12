const WHSale = require('../models/WHSale');
const WHSaleReturn = require('../models/WHSaleReturn');
const WHItem = require('../models/WHItem');
const Item = require('../models/Item');
const WHCustomer = require('../models/WHCustomer');
const WHStockLog = require('../models/WHStockLog');
const WHPOSCounter = require('../models/WHPOSCounter');
const User = require('../models/User');
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

async function verifyPOSPassword(req) {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const userId = req.user?._id || req.user?.id;
    if (!password || !userId) {
        throw Object.assign(new Error('Enter your current login password to continue.'), { statusCode: 401 });
    }

    const user = await User.findById(userId).select('+password');
    if (!user || !(await user.matchPassword(password))) {
        throw Object.assign(new Error('The current login password is incorrect.'), { statusCode: 401 });
    }
}

async function getNextWHPOSInvoiceNumber() {
    const counterId = 'pos-sale-invoice';
    let counter = await WHPOSCounter.findById(counterId).lean();
    if (!counter) {
        const [highestInvoice] = await WHSale.aggregate([
            {
                $match: {
                    payMode: 'Cash',
                    printSize: 'Thermal',
                    invoiceNo: { $regex: /^\d+$/ }
                }
            },
            {
                $addFields: {
                    numericInvoiceNo: {
                        $convert: { input: '$invoiceNo', to: 'long', onError: 0, onNull: 0 }
                    }
                }
            },
            { $sort: { numericInvoiceNo: -1 } },
            { $limit: 1 },
            { $project: { numericInvoiceNo: 1 } }
        ]);
        try {
            await WHPOSCounter.create({
                _id: counterId,
                value: Math.max(1000, Number(highestInvoice?.numericInvoiceNo || 0))
            });
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }

    while (true) {
        const nextCounter = await WHPOSCounter.findOneAndUpdate(
            { _id: counterId },
            { $inc: { value: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        const invoiceNo = String(nextCounter.value);
        if (!(await WHSale.exists({ invoiceNo }))) return invoiceNo;
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

exports.createWHPOSSale = async (req, res) => {
    try {
        await verifyPOSPassword(req);
        const inputLines = req.body.items;
        const cashReceived = Number(req.body.cashReceived);
        const discountPercent = Number(req.body.globalDiscountPercent ?? 0);
        const flatDiscount = Number(req.body.globalDiscountAmount ?? 0);
        const miscCharges = Number(req.body.miscCharges ?? 0);
        if (!Array.isArray(inputLines) || inputLines.length === 0) {
            return res.status(400).json({ success: false, message: 'Add at least one item to the sale.' });
        }
        if (!Number.isFinite(cashReceived) || cashReceived < 0) {
            return res.status(400).json({ success: false, message: 'Enter a valid cash received amount.' });
        }
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100
            || !Number.isFinite(flatDiscount) || flatDiscount < 0
            || !Number.isFinite(miscCharges) || miscCharges < 0) {
            return res.status(400).json({ success: false, message: 'Enter valid discount and miscellaneous charge amounts.' });
        }

        const quantities = new Map();
        for (const line of inputLines) {
            const itemId = String(line.item || '').trim();
            const quantity = Number(line.quantity);
            if (!mongoose.Types.ObjectId.isValid(itemId) || !Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ success: false, message: 'Each sale line needs a valid item and quantity.' });
            }
            quantities.set(itemId, (quantities.get(itemId) || 0) + quantity);
        }

        let saleId;
        await executeWithOptionalSession(async (session) => {
            const itemIds = Array.from(quantities.keys());
            const query = WHItem.find({ _id: { $in: itemIds }, isActive: { $ne: false } });
            if (session) query.session(session);
            const items = await query;
            if (items.length !== itemIds.length) {
                throw Object.assign(new Error('One or more selected warehouse items are unavailable.'), { statusCode: 404 });
            }

            const saleLines = [];
            let totalQuantity = 0;
            let total = 0;
            for (const item of items) {
                const quantity = quantities.get(String(item._id));
                const available = Number(item.stock?.[0]?.quantity || 0);
                if (quantity > available) {
                    throw Object.assign(
                        new Error(`Insufficient stock for ${item.name}. Available: ${available}.`),
                        { statusCode: 400 }
                    );
                }
                const price = Number(item.retailPrice || item.salePrice || 0);
                const lineTotal = Math.round((price * quantity + Number.EPSILON) * 100) / 100;
                saleLines.push({
                    item: item._id,
                    name: item.name,
                    itemName: item.name,
                    barcode: item.barcode || item.itemsCode || '',
                    quantity,
                    pcsPrice: price,
                    retailPrice: price,
                    subTotal: lineTotal,
                    totalBeforeIncentive: lineTotal,
                    netTotal: lineTotal
                });
                totalQuantity += quantity;
                total += lineTotal;
            }

            total = Math.round((total + Number.EPSILON) * 100) / 100;
            const percentageDiscount = Math.round((total * discountPercent / 100 + Number.EPSILON) * 100) / 100;
            const discountAmount = Math.round((percentageDiscount + flatDiscount + Number.EPSILON) * 100) / 100;
            if (discountAmount > total) {
                throw Object.assign(new Error('Total discount cannot exceed the sale subtotal.'), { statusCode: 400 });
            }
            const netTotal = Math.round((total - discountAmount + miscCharges + Number.EPSILON) * 100) / 100;
            if (cashReceived < netTotal) {
                throw Object.assign(new Error('Cash received must be at least the sale total.'), { statusCode: 400 });
            }
            const invoiceNo = await getNextWHPOSInvoiceNumber();

            let customerQuery = WHCustomer.findOne({ isCash: true, customerName: 'Walk-in Customer' });
            if (session) customerQuery.session(session);
            let customer = await customerQuery;
            if (!customer) {
                const customerData = {
                    customerName: 'Walk-in Customer',
                    customerNTN: 'N/A',
                    isCash: true,
                    isActive: true,
                    createdBy: req.user?._id || req.user?.id
                };

                [customer] = session
                    ? await WHCustomer.create([customerData], { session })
                    : await WHCustomer.create([customerData]);
            }

            const saleData = {
                invoiceNo,
                invoiceDate: new Date(),
                customer: customer._id,
                items: saleLines,
                totalQuantity,
                totalAmount: total,
                globalDiscountPercent: discountPercent,
                globalDiscountAmount: flatDiscount,
                miscCharges,
                netTotal,
                paidAmount: netTotal,
                cashReceived,
                changeAmount: Math.round((cashReceived - netTotal + Number.EPSILON) * 100) / 100,
                invoiceBalance: 0,
                payMode: 'Cash',
                printSize: 'Thermal',
                status: 'Posted',
                createdBy: req.user?._id || req.user?.id
            };
            const [sale] = session
                ? await WHSale.create([saleData], { session })
                : await WHSale.create([saleData]);

            for (const line of saleLines) {
                const item = items.find(candidate => String(candidate._id) === String(line.item));
                const previousQty = Number(item.stock?.[0]?.quantity || 0);
                const newQty = previousQty - line.quantity;
                if (item.stock?.length) item.stock[0].quantity = newQty;
                else item.stock = [{ quantity: newQty, opening: 0 }];
                item.markModified('stock');
                await item.save(session ? { session } : {});

                const stockLog = {
                    item: item._id,
                    date: sale.invoiceDate,
                    type: 'out',
                    qty: line.quantity,
                    previousQty,
                    newQty,
                    refType: 'sale',
                    refId: sale._id,
                    remarks: `POS Sale #${sale.invoiceNo}`,
                    createdBy: req.user?._id || req.user?.id
                };
                if (session) await WHStockLog.create([stockLog], { session });
                else await WHStockLog.create(stockLog);
            }

            await addLedgerEntry({
                customer: customer._id,
                date: sale.invoiceDate,
                description: `Cash POS Sale - Invoice #${sale.invoiceNo}`,
                refType: 'Sale',
                refId: sale._id,
                debit: netTotal,
                credit: netTotal,
                createdBy: req.user?._id || req.user?.id,
                session
            });
            saleId = sale._id;
        });

        const saved = await WHSale.findById(saleId)
            .populate('customer', 'customerName name phone address code')
            .populate('items.item', 'name barcode itemsCode')
            .lean();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
};

exports.getWHPOSReturnInvoice = async (req, res) => {
    try {
        const invoiceNo = String(req.params.invoiceNo || '').trim();
        if (!invoiceNo) {
            return res.status(400).json({ success: false, message: 'Enter a sale invoice number.' });
        }

        const sale = await WHSale.findOne({ invoiceNo, status: 'Posted' })
            .populate('customer', 'customerName name phone address')
            .populate('items.item', 'name barcode itemsCode')
            .lean();
        if (!sale) {
            return res.status(404).json({ success: false, message: `Posted sale invoice ${invoiceNo} was not found.` });
        }
        if (sale.payMode !== 'Cash') {
            return res.status(400).json({ success: false, message: 'POS returns are only available for cash sale invoices.' });
        }

        const postedReturns = await WHSaleReturn.find({
            originalSale: sale._id,
            status: { $in: ['Posted', 'Pending Approval'] }
        })
            .select('items')
            .lean();
        const returnedByItem = new Map();
        postedReturns.forEach((saleReturn) => {
            saleReturn.items.forEach((line) => {
                const itemId = String(line.item?._id || line.item);
                returnedByItem.set(itemId, (returnedByItem.get(itemId) || 0) + Number(line.quantity || 0));
            });
        });

        const itemsById = new Map();
        sale.items.forEach((line) => {
            const itemId = String(line.item?._id || line.item);
            const quantity = Number(line.quantity || 0);
            const pcsPrice = Number(line.pcsPrice || line.retailPrice || 0);
            const lineTotal = Number(line.subTotal ?? line.totalBeforeIncentive ?? (pcsPrice * quantity));
            const existing = itemsById.get(itemId);
            if (existing) {
                existing.quantitySold += quantity;
                existing.subTotal += lineTotal;
            } else {
                itemsById.set(itemId, {
                    item: itemId,
                    name: line.name || line.itemName || line.item?.name || 'Item',
                    barcode: line.barcode || line.item?.barcode || line.item?.itemsCode || '',
                    quantitySold: quantity,
                    subTotal: lineTotal,
                    pcsPrice: quantity ? lineTotal / quantity : pcsPrice
                });
            }
        });

        const items = Array.from(itemsById.values()).map((line) => {
            const quantityReturned = returnedByItem.get(line.item) || 0;
            const quantityRemaining = Math.max(0, line.quantitySold - quantityReturned);
            return {
                ...line,
                pcsPrice: line.quantitySold ? line.subTotal / line.quantitySold : line.pcsPrice,
                quantityReturned,
                quantityRemaining
            };
        });

        res.status(200).json({
            success: true,
            data: {
                sale,
                items,
                subtotal: Number(sale.totalAmount || 0),
                discountPercent: Number(sale.globalDiscountPercent || 0),
                flatDiscount: Number(sale.globalDiscountAmount || 0),
                taxAmount: Number(sale.globalTaxAmount || 0)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createWHPOSReturn = async (req, res) => {
    try {
        await verifyPOSPassword(req);
        const { originalSaleId, items: inputLines } = req.body;
        if (!mongoose.Types.ObjectId.isValid(String(originalSaleId || ''))) {
            return res.status(400).json({ success: false, message: 'Select a valid original sale invoice.' });
        }
        if (!Array.isArray(inputLines) || !inputLines.length) {
            return res.status(400).json({ success: false, message: 'Select at least one item quantity to return.' });
        }

        const requestedByItem = new Map();
        for (const line of inputLines) {
            const itemId = String(line.item || '').trim();
            const quantity = Number(line.quantity);
            if (!mongoose.Types.ObjectId.isValid(itemId) || !Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ success: false, message: 'Each return line needs a valid item and quantity.' });
            }
            requestedByItem.set(itemId, (requestedByItem.get(itemId) || 0) + quantity);
        }

        let returnId;
        await executeWithOptionalSession(async (session) => {
            let saleQuery = WHSale.findById(originalSaleId);
            if (session) saleQuery = saleQuery.session(session);
            const sale = await saleQuery;
            if (!sale || sale.status !== 'Posted') {
                throw Object.assign(new Error('The original posted sale invoice was not found.'), { statusCode: 404 });
            }
            if (sale.payMode !== 'Cash') {
                throw Object.assign(new Error('POS returns are only available for cash sale invoices.'), { statusCode: 400 });
            }

            let returnsQuery = WHSaleReturn.find({
                originalSale: sale._id,
                status: { $in: ['Posted', 'Pending Approval'] }
            }).select('items');
            if (session) returnsQuery = returnsQuery.session(session);
            const postedReturns = await returnsQuery;
            const returnedByItem = new Map();
            postedReturns.forEach((saleReturn) => saleReturn.items.forEach((line) => {
                const itemId = String(line.item?._id || line.item);
                returnedByItem.set(itemId, (returnedByItem.get(itemId) || 0) + Number(line.quantity || 0));
            }));

            const soldByItem = new Map();
            sale.items.forEach((line) => {
                const itemId = String(line.item?._id || line.item);
                const quantity = Number(line.quantity || 0);
                const pcsPrice = Number(line.pcsPrice || line.retailPrice || 0);
                const lineTotal = Number(line.subTotal ?? line.totalBeforeIncentive ?? (pcsPrice * quantity));
                const existing = soldByItem.get(itemId);
                if (existing) {
                    existing.quantity += quantity;
                    existing.subTotal += lineTotal;
                } else {
                    soldByItem.set(itemId, {
                        item: line.item,
                        name: line.name || line.itemName || 'Item',
                        barcode: line.barcode || '',
                        quantity,
                        subTotal: lineTotal,
                        pcsPrice: quantity ? lineTotal / quantity : pcsPrice
                    });
                }
            });

            const selectedLines = [];
            let totalQuantity = 0;
            let totalAmount = 0;
            for (const [itemId, quantity] of requestedByItem) {
                const original = soldByItem.get(itemId);
                const remaining = original ? original.quantity - (returnedByItem.get(itemId) || 0) : 0;
                if (!original || quantity > remaining + 0.000001) {
                    throw Object.assign(
                        new Error(`Return quantity exceeds the remaining sold quantity for ${original?.name || 'an item'}. Remaining: ${Math.max(0, remaining)}.`),
                        { statusCode: 400 }
                    );
                }
                const returnedSubTotal = Math.round((original.subTotal * quantity / original.quantity + Number.EPSILON) * 100) / 100;
                selectedLines.push({
                    item: original.item,
                    name: original.name,
                    itemName: original.name,
                    barcode: original.barcode,
                    quantity,
                    pcsPrice: original.pcsPrice,
                    retailPrice: original.pcsPrice,
                    subTotal: returnedSubTotal,
                    totalBeforeIncentive: returnedSubTotal,
                    netTotal: returnedSubTotal
                });
                totalQuantity += quantity;
                totalAmount += returnedSubTotal;
            }

            totalAmount = Math.round((totalAmount + Number.EPSILON) * 100) / 100;
            const originalSubtotal = Number(sale.totalAmount || 0);
            const discountPercent = Number(sale.globalDiscountPercent || 0);
            const flatDiscount = originalSubtotal > 0
                ? Math.round((Number(sale.globalDiscountAmount || 0) * totalAmount / originalSubtotal + Number.EPSILON) * 100) / 100
                : 0;
            const percentDiscountAmount = Math.round((totalAmount * discountPercent / 100 + Number.EPSILON) * 100) / 100;
            const taxAmount = originalSubtotal > 0
                ? Math.round((Number(sale.globalTaxAmount || 0) * totalAmount / originalSubtotal + Number.EPSILON) * 100) / 100
                : 0;
            const refundTotal = Math.round((Math.max(0, totalAmount - percentDiscountAmount - flatDiscount + taxAmount) + Number.EPSILON) * 100) / 100;
            if (refundTotal <= 0) {
                throw Object.assign(new Error('The selected return has no refundable amount.'), { statusCode: 400 });
            }

            const itemIds = selectedLines.map((line) => line.item);
            let itemsQuery = WHItem.find({ _id: { $in: itemIds } });
            if (session) itemsQuery = itemsQuery.session(session);
            const warehouseItems = await itemsQuery;
            if (warehouseItems.length !== itemIds.length) {
                throw Object.assign(new Error('One or more returned warehouse items no longer exist.'), { statusCode: 404 });
            }

            const returnData = {
                returnNo: 'AUTO',
                returnDate: new Date(),
                originalSale: sale._id,
                customer: sale.customer,
                remarks: `POS return against invoice ${sale.invoiceNo}`,
                items: selectedLines,
                totalQuantity,
                totalAmount,
                globalDiscountPercent: discountPercent,
                globalDiscountAmount: flatDiscount,
                globalTaxAmount: taxAmount,
                miscCharges: 0,
                netTotal: refundTotal,
                paidAmount: refundTotal,
                returnBalance: 0,
                payMode: 'Cash',
                printSize: 'Thermal',
                status: 'Pending Approval',
                createdBy: req.user?._id || req.user?.id
            };
            const [saleReturn] = session
                ? await WHSaleReturn.create([returnData], { session })
                : await WHSaleReturn.create([returnData]);
            returnId = saleReturn._id;
        });

        const saved = await WHSaleReturn.findById(returnId)
            .populate('customer', 'customerName name phone address')
            .populate('originalSale', 'invoiceNo')
            .populate('items.item', 'name barcode itemsCode')
            .lean();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
};

exports.getWHPOSReturnQueue = async (req, res) => {
    try {
        const pending = await WHSaleReturn.find({ status: 'Pending Approval' })
            .populate('customer', 'customerName name phone')
            .populate('originalSale', 'invoiceNo invoiceDate')
            .populate('createdBy', 'name email')
            .populate('items.item', 'name barcode itemsCode')
            .sort({ createdAt: 1 })
            .lean();
        res.status(200).json({ success: true, count: pending.length, data: pending });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.reviewWHPOSReturn = async (req, res) => {
    try {
        const action = req.params.action;
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Choose approve or reject.' });
        }
        if (action === 'reject' && !String(req.body.remarks || '').trim()) {
            return res.status(400).json({ success: false, message: 'Enter a reason for rejecting this return.' });
        }

        let reviewedReturnId;
        await executeWithOptionalSession(async (session) => {
            let returnQuery = WHSaleReturn.findOne({
                _id: req.params.id,
                status: 'Pending Approval'
            });
            if (session) returnQuery = returnQuery.session(session);
            const saleReturn = await returnQuery;
            if (!saleReturn) {
                throw Object.assign(new Error('Pending POS return request was not found or was already reviewed.'), { statusCode: 404 });
            }

            if (action === 'approve') {
                let sale = null;
                if (saleReturn.originalSale) {
                    sale = await WHSale.findById(saleReturn.originalSale).session(session || null);
                    if (!sale || sale.status !== 'Posted') {
                        throw Object.assign(new Error('The original sale is unavailable; this return cannot be approved.'), { statusCode: 400 });
                    }

                    const postedReturns = await WHSaleReturn.find({
                        originalSale: sale._id,
                        status: 'Posted',
                        _id: { $ne: saleReturn._id }
                    }).select('items').session(session || null);
                    const alreadyReturned = new Map();
                    for (const postedReturn of postedReturns) {
                        for (const line of postedReturn.items) {
                            const itemId = String(line.item?._id || line.item);
                            alreadyReturned.set(itemId, (alreadyReturned.get(itemId) || 0) + Number(line.quantity || 0));
                        }
                    }
                    const sold = new Map();
                    for (const line of sale.items) {
                        const itemId = String(line.item?._id || line.item);
                        sold.set(itemId, (sold.get(itemId) || 0) + Number(line.quantity || 0));
                    }
                    for (const line of saleReturn.items) {
                        const itemId = String(line.item?._id || line.item);
                        const requested = Number(line.quantity || 0);
                        const remaining = (sold.get(itemId) || 0) - (alreadyReturned.get(itemId) || 0);
                        if (requested > remaining + 0.000001) {
                            throw Object.assign(new Error(`Return quantity for ${line.name || 'an item'} exceeds the remaining sold quantity (${Math.max(0, remaining)}).`), { statusCode: 400 });
                        }
                    }
                }

                const itemIds = saleReturn.items.map((line) => line.item);
                const items = await WHItem.find({ _id: { $in: itemIds } }).session(session || null);
                if (items.length !== new Set(itemIds.map(String)).size) {
                    throw Object.assign(new Error('One or more returned items no longer exist in warehouse inventory.'), { statusCode: 404 });
                }

                for (const line of saleReturn.items) {
                    const item = items.find((candidate) => String(candidate._id) === String(line.item));
                    const previousQty = Number(item.stock?.[0]?.quantity || 0);
                    const newQty = previousQty + Number(line.quantity || 0);
                    if (item.stock?.length) item.stock[0].quantity = newQty;
                    else item.stock = [{ quantity: newQty, opening: 0 }];
                    item.markModified('stock');
                    await item.save(session ? { session } : {});
                    const stockLog = {
                        item: item._id,
                        date: saleReturn.returnDate,
                        type: 'in',
                        qty: Number(line.quantity || 0),
                        previousQty,
                        newQty,
                        refType: 'sales_return',
                        refId: saleReturn._id,
                        remarks: sale
                            ? `Approved POS Return #${saleReturn.returnNo} against ${sale.invoiceNo}`
                            : `Approved Sale Return #${saleReturn.returnNo}`,
                        createdBy: req.user?._id || req.user?.id
                    };
                    if (session) await WHStockLog.create([stockLog], { session });
                    else await WHStockLog.create(stockLog);
                }

                await addLedgerEntry({
                    customer: saleReturn.customer,
                    date: saleReturn.returnDate,
                    description: sale && sale.payMode === 'Cash' && sale.printSize === 'Thermal'
                        ? `Cash POS Return #${saleReturn.returnNo} against invoice #${sale.invoiceNo}`
                        : `Sale Return - Memo #${saleReturn.returnNo}`,
                    refType: 'SaleReturn',
                    refId: saleReturn._id,
                    debit: sale && sale.payMode === 'Cash' && sale.printSize === 'Thermal'
                        ? Number(saleReturn.netTotal || 0)
                        : 0,
                    credit: Number(saleReturn.netTotal || 0),
                    createdBy: req.user?._id || req.user?.id,
                    session
                });
                saleReturn.status = 'Posted';
            } else {
                saleReturn.status = 'Cancelled';
                saleReturn.reviewRemarks = String(req.body.remarks).trim();
            }

            saleReturn.reviewedBy = req.user?._id || req.user?.id;
            saleReturn.reviewedAt = new Date();
            await saleReturn.save(session ? { session } : {});
            reviewedReturnId = saleReturn._id;
        });

        const result = await WHSaleReturn.findById(reviewedReturnId)
            .populate('customer', 'customerName name phone')
            .populate('originalSale', 'invoiceNo')
            .populate('reviewedBy', 'name email')
            .lean();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, message: error.message });
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
exports.getWHPOSSales = async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
        const query = { status: 'Posted', payMode: 'Cash', printSize: 'Thermal' };
        const { startDate, endDate, search } = req.query;

        if (startDate || endDate) {
            query.invoiceDate = {};
            if (startDate) {
                const date = new Date(startDate);
                if (Number.isNaN(date.getTime())) {
                    return res.status(400).json({ success: false, message: 'Invalid start date.' });
                }
                date.setHours(0, 0, 0, 0);
                query.invoiceDate.$gte = date;
            }
            if (endDate) {
                const date = new Date(endDate);
                if (Number.isNaN(date.getTime())) {
                    return res.status(400).json({ success: false, message: 'Invalid end date.' });
                }
                date.setHours(23, 59, 59, 999);
                query.invoiceDate.$lte = date;
            }
        }

        const term = String(search || '').trim();
        if (term) {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedTerm, 'i');
            const matchingCustomers = await WHCustomer.find({
                $or: [{ customerName: regex }, { name: regex }]
            }).distinct('_id');
            query.$or = [
                { invoiceNo: regex },
                { remarks: regex },
                { customer: { $in: matchingCustomers } }
            ];
        }

        const [total, sales] = await Promise.all([
            WHSale.countDocuments(query),
            WHSale.find(query)
                .populate('customer', 'customerName name')
                .populate('createdBy', 'name')
                .sort({ invoiceDate: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);
        const saleIds = sales.map((sale) => sale._id);
        const returns = saleIds.length
            ? await WHSaleReturn.aggregate([
                { $match: { originalSale: { $in: saleIds }, status: 'Posted' } },
                { $group: { _id: '$originalSale', total: { $sum: '$netTotal' } } }
            ])
            : [];
        const returnedBySale = new Map(returns.map((entry) => [String(entry._id), entry.total]));

        res.status(200).json({
            success: true,
            data: sales.map((sale) => ({
                ...sale,
                totalReturned: returnedBySale.get(String(sale._id)) || 0
            })),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWHPOSReturns = async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
        const query = {};
        const { startDate, endDate, search, status } = req.query;

        if (status && status !== 'All') {
            if (!['Pending Approval', 'Posted', 'Cancelled', 'Draft'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid return status filter.' });
            }
            query.status = status;
        }
        if (startDate || endDate) {
            query.returnDate = {};
            if (startDate) {
                const date = new Date(startDate);
                if (Number.isNaN(date.getTime())) {
                    return res.status(400).json({ success: false, message: 'Invalid start date.' });
                }
                date.setHours(0, 0, 0, 0);
                query.returnDate.$gte = date;
            }
            if (endDate) {
                const date = new Date(endDate);
                if (Number.isNaN(date.getTime())) {
                    return res.status(400).json({ success: false, message: 'Invalid end date.' });
                }
                date.setHours(23, 59, 59, 999);
                query.returnDate.$lte = date;
            }
        }

        const term = String(search || '').trim();
        if (term) {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedTerm, 'i');
            const [matchingCustomers, matchingSales] = await Promise.all([
                WHCustomer.find({ $or: [{ customerName: regex }, { name: regex }] }).distinct('_id'),
                WHSale.find({ invoiceNo: regex }).distinct('_id')
            ]);
            query.$or = [
                { returnNo: regex },
                { remarks: regex },
                { reviewRemarks: regex },
                { customer: { $in: matchingCustomers } },
                { originalSale: { $in: matchingSales } }
            ];
        }

        const [total, returns] = await Promise.all([
            WHSaleReturn.countDocuments(query),
            WHSaleReturn.find(query)
                .populate('customer', 'customerName name')
                .populate('originalSale', 'invoiceNo invoiceDate')
                .populate('createdBy', 'name')
                .populate('reviewedBy', 'name')
                .sort({ returnDate: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);
        res.status(200).json({
            success: true,
            data: returns,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

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
