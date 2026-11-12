const WHPurchase = require('../models/WHPurchase');
const WHItem = require('../models/WHItem');
const Item = require('../models/Item');
const WHSupplier = require('../models/WHSupplier');
const WHStockLog = require('../models/WHStockLog');

// Helper to populate missing item names from WHItem or retail Item collection
async function populateMissingItemNames(purchasesList) {
    if (!purchasesList || !purchasesList.length) return purchasesList;

    const missingBarcodes = new Set();
    const missingItemIds = new Set();

    for (const purchase of purchasesList) {
        if (!purchase || !Array.isArray(purchase.items)) continue;
        for (const line of purchase.items) {
            const hasName = line.name || line.itemName || line.item?.name;
            if (!hasName) {
                if (line.barcode) missingBarcodes.add(line.barcode);
                if (line.item) {
                    const idStr = typeof line.item === 'object' ? (line.item._id ? String(line.item._id) : null) : String(line.item);
                    if (idStr) missingItemIds.add(idStr);
                }
            }
        }
    }

    if (missingBarcodes.size === 0 && missingItemIds.size === 0) return purchasesList;

    const [whItemsByBarcode, itemsByBarcode, itemsById] = await Promise.all([
        missingBarcodes.size > 0 ? WHItem.find({ barcode: { $in: Array.from(missingBarcodes) } }, 'name barcode').lean() : [],
        missingBarcodes.size > 0 ? Item.find({ barcode: { $in: Array.from(missingBarcodes) } }, 'name barcode').lean() : [],
        missingItemIds.size > 0 ? Item.find({ _id: { $in: Array.from(missingItemIds) } }, 'name barcode').lean() : []
    ]);

    const nameMap = {};
    for (const it of whItemsByBarcode) {
        if (it && it.barcode && it.name) nameMap[it.barcode] = it.name;
    }
    for (const it of itemsByBarcode) {
        if (it && it.barcode && it.name && !nameMap[it.barcode]) nameMap[it.barcode] = it.name;
    }
    for (const it of itemsById) {
        if (it && it._id && it.name) nameMap[String(it._id)] = it.name;
    }

    for (const purchase of purchasesList) {
        if (!purchase || !Array.isArray(purchase.items)) continue;
        for (const line of purchase.items) {
            const currentName = line.name || line.itemName || line.item?.name;
            if (!currentName) {
                const idStr = line.item ? (typeof line.item === 'object' ? String(line.item._id || '') : String(line.item)) : '';
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
        }
    }

    return purchasesList;
}

// @desc    Create new WH Purchase
// @route   POST /api/v1/wh-purchases
// @access  Private
exports.createWHPurchase = async (req, res) => {
    try {
        const purchaseData = {
            ...req.body,
            createdBy: req.user ? req.user._id : null
        };

        // Generate Booking/Posting Number if Status is Posted
        if (purchaseData.status === 'Posted') {
            const lastPurchase = await WHPurchase.findOne({ status: 'Posted' }).sort({ postingNumber: -1 });
            const nextNumber = lastPurchase && lastPurchase.postingNumber ? lastPurchase.postingNumber + 1 : 1;
            purchaseData.postingNumber = nextNumber;
        }

        const purchase = await WHPurchase.create(purchaseData);

        // Update Stock if Status is Posted
        if (purchase.status === 'Posted') {
            for (const line of purchase.items) {
                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const purchaseQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty + purchaseQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }

                    // Update Item Master prices from purchase
                    if (line.costPrice > 0) whItem.costPrice = line.costPrice;
                    if (line.retailPrice > 0) whItem.retailPrice = line.retailPrice;

                    whItem.markModified('stock');
                    await whItem.save();

                    // Create Stock Log
                    await WHStockLog.create({
                        item: whItem._id,
                        date: purchase.invoiceDate,
                        type: 'in',
                        qty: purchaseQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase',
                        refId: purchase._id,
                        remarks: `Purchase #${purchase.invoiceNo || 'Draft'}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        const saved = await WHPurchase.findById(purchase._id)
            .populate('supplier', 'supplierName name phone address code')
            .lean();
        if (saved) {
            await populateMissingSupplierNames([saved]);
        }

        res.status(201).json({
            success: true,
            data: saved || purchase
        });
    } catch (error) {
        console.error('Error creating WH Purchase:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Helper to ensure supplier name is populated and normalized on all purchases
async function populateMissingSupplierNames(purchasesList) {
    if (!purchasesList || !purchasesList.length) return purchasesList;

    const unpopulatedSupplierIds = new Set();
    for (const purchase of purchasesList) {
        if (!purchase) continue;
        if (!purchase.supplier || typeof purchase.supplier !== 'object' || (!purchase.supplier.supplierName && !purchase.supplier.name)) {
            const sId = purchase.supplier && typeof purchase.supplier === 'object' ? (purchase.supplier._id ? String(purchase.supplier._id) : null) : (purchase.supplier ? String(purchase.supplier) : null);
            if (sId) unpopulatedSupplierIds.add(sId);
        }
    }

    let supplierMap = {};
    if (unpopulatedSupplierIds.size > 0) {
        const foundWHSuppliers = await WHSupplier.find({ _id: { $in: Array.from(unpopulatedSupplierIds) } }, 'supplierName name phone address code').lean();
        for (const s of foundWHSuppliers) {
            const resolvedName = s.supplierName || s.name || '';
            supplierMap[String(s._id)] = {
                _id: s._id,
                supplierName: resolvedName,
                name: resolvedName,
                phone: s.phone || '',
                address: s.address || '',
                code: s.code || ''
            };
        }
    }

    for (const purchase of purchasesList) {
        if (!purchase) continue;
        const sId = purchase.supplier && typeof purchase.supplier === 'object' ? String(purchase.supplier._id || '') : (purchase.supplier ? String(purchase.supplier) : '');
        if (purchase.supplier && typeof purchase.supplier === 'object' && (purchase.supplier.supplierName || purchase.supplier.name)) {
            const resolvedName = purchase.supplier.supplierName || purchase.supplier.name || '';
            purchase.supplier.name = resolvedName;
            purchase.supplier.supplierName = resolvedName;
            purchase.supplierName = resolvedName;
        } else if (sId && supplierMap[sId]) {
            purchase.supplier = supplierMap[sId];
            purchase.supplierName = supplierMap[sId].name;
        } else if (purchase.supplierName) {
            if (!purchase.supplier || typeof purchase.supplier !== 'object') {
                purchase.supplier = { name: purchase.supplierName, supplierName: purchase.supplierName };
            } else {
                purchase.supplier.name = purchase.supplierName;
                purchase.supplier.supplierName = purchase.supplierName;
            }
        }
    }

    return purchasesList;
}

// @desc    Get all WH Purchases
// @route   GET /api/v1/wh-purchases
// @access  Private
exports.getWHPurchases = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;

        let query = {};

        // Date Filter
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

        let purchases = await WHPurchase.find(query)
            .populate('supplier', 'supplierName name phone address code')
            .populate('createdBy', 'name')
            .populate('items.item', 'name barcode costPrice')
            .sort({ createdAt: -1 })
            .lean();

        // Ensure supplier names and line items are populated & normalized
        purchases = await populateMissingSupplierNames(purchases);
        purchases = await populateMissingItemNames(purchases);

        // In-memory search filter (to include populated fields)
        if (search) {
            const searchLower = search.toLowerCase();
            purchases = purchases.filter(p =>
                (p.invoiceNo && p.invoiceNo.toLowerCase().includes(searchLower)) ||
                (p.remarks && p.remarks.toLowerCase().includes(searchLower)) ||
                (p.supplier && ((p.supplier.supplierName && p.supplier.supplierName.toLowerCase().includes(searchLower)) || (p.supplier.name && p.supplier.name.toLowerCase().includes(searchLower)))) ||
                (p.supplierName && p.supplierName.toLowerCase().includes(searchLower)) ||
                (p.postingNumber && String(p.postingNumber).includes(searchLower))
            );
        }

        res.status(200).json({
            success: true,
            count: purchases.length,
            data: purchases
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get single WH Purchase
// @route   GET /api/v1/wh-purchases/:id
// @access  Private
exports.getWHPurchase = async (req, res) => {
    try {
        let purchase = await WHPurchase.findById(req.params.id)
            .populate('supplier')
            .populate({
                path: 'items.item',
                populate: [
                    { path: 'itemClass' },
                    { path: 'company' }
                ]
            })
            .lean();

        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        await populateMissingSupplierNames([purchase]);
        await populateMissingItemNames([purchase]);

        res.status(200).json({
            success: true,
            data: purchase
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Update WH Purchase
// @route   PUT /api/v1/wh-purchases/:id
// @access  Private
exports.updateWHPurchase = async (req, res) => {
    try {
        let purchase = await WHPurchase.findById(req.params.id);
        const existingStatus = purchase ? purchase.status : '';

        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        // Check if status is changing to Posted and generate number if not exists
        if (req.body.status === 'Posted' && (!purchase.postingNumber || purchase.status !== 'Posted')) {
            const lastPurchase = await WHPurchase.findOne({ status: 'Posted' }).sort({ postingNumber: -1 });
            const nextNumber = lastPurchase && lastPurchase.postingNumber ? lastPurchase.postingNumber + 1 : 1;
            req.body.postingNumber = nextNumber;
        }

        const oldItems = JSON.parse(JSON.stringify(purchase.items)); // Deep copy old items

        purchase = await WHPurchase.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        // CASE 1: Transitioning to Posted OR already Posted (Modifying)
        if (purchase.status === 'Posted') {
            if (existingStatus === 'Posted') {
                // Optimize: Calculate NET changes to avoid log noise
                const itemMap = {};
                oldItems.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) - (parseFloat(it.quantity) || 0);
                });
                purchase.items.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) + (parseFloat(it.quantity) || 0);
                });

                for (const itemId of Object.keys(itemMap)) {
                    const netQty = itemMap[itemId];
                    if (netQty === 0) continue; // No quantity change, no stock log needed

                    const whItem = await WHItem.findById(itemId);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const logType = netQty > 0 ? 'in' : 'out'; // Positive net means more purchased
                        const absQty = Math.abs(netQty);
                        const newQty = logType === 'in' ? previousQty + absQty : previousQty - absQty;

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }

                        // Also update master prices if they changed in the purchase edit
                        const lineItem = purchase.items.find(it => it.item.toString() === itemId);
                        if (lineItem) {
                            if (lineItem.costPrice > 0) whItem.costPrice = lineItem.costPrice;
                            if (lineItem.retailPrice > 0) whItem.retailPrice = lineItem.retailPrice;
                        }

                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: purchase.invoiceDate,
                            type: logType,
                            qty: absQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'purchase',
                            refId: purchase._id,
                            remarks: `Updated Purchase #${purchase.postingNumber || purchase.invoiceNo} (Net Change)`,
                            createdBy: req.user ? req.user._id : null
                        });
                    }
                }
            } else {
                // Apply NEW impact for first-time posting
                for (const line of purchase.items) {
                    const whItem = await WHItem.findById(line.item);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const purchaseQty = parseFloat(line.quantity) || 0;
                        const newQty = previousQty + purchaseQty; // Add purchase

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }

                        // Update master prices on first-time posting
                        if (line.costPrice > 0) whItem.costPrice = line.costPrice;
                        if (line.retailPrice > 0) whItem.retailPrice = line.retailPrice;

                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: purchase.invoiceDate,
                            type: 'in',
                            qty: purchaseQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'purchase',
                            refId: purchase._id,
                            remarks: `Purchase #${purchase.postingNumber || purchase.invoiceNo}`,
                            createdBy: req.user ? req.user._id : null
                        });
                    }
                }
            }
        }
        // CASE 2: Transitioning from Posted to Draft
        else if (existingStatus === 'Posted') {
            for (const line of oldItems) {
                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const oldPurchaseQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty - oldPurchaseQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: purchase.invoiceDate,
                        type: 'out',
                        qty: oldPurchaseQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase',
                        refId: purchase._id,
                        remarks: `Unposted Purchase #${purchase.postingNumber || purchase.invoiceNo}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            data: purchase
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Delete WH Purchase
// @route   DELETE /api/v1/wh-purchases/:id
// @access  Private
exports.deleteWHPurchase = async (req, res) => {
    try {
        const purchase = await WHPurchase.findById(req.params.id);

        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        // Reverse stock if Posted
        if (purchase.status === 'Posted') {
            for (const line of purchase.items) {
                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const purchaseQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty - purchaseQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    // Create reversal log
                    await WHStockLog.create({
                        item: whItem._id,
                        date: purchase.invoiceDate,
                        type: 'out',
                        qty: purchaseQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase',
                        refId: purchase._id,
                        remarks: `DELETED: Purchase #${purchase.postingNumber || purchase.invoiceNo} (REVERSED)`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        await purchase.deleteOne();
        res.status(200).json({ success: true, message: 'Purchase deleted and stock reversed' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @desc    Get next invoice number
// @route   GET /api/v1/wh-purchases/next-number
exports.getNextInvoiceNumber = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const count = await WHPurchase.countDocuments({
            createdAt: { $gte: startOfYear, $lt: endOfYear }
        });

        const nextNo = `PUR-${year}-${String(count + 1).padStart(4, '0')}`;
        res.status(200).json({ success: true, data: nextNo, nextInvoiceNo: nextNo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
