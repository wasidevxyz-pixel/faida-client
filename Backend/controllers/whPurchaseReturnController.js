const WHPurchaseReturn = require('../models/WHPurchaseReturn');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');

// Create Purchase Return
exports.createWHPurchaseReturn = async (req, res) => {
    try {
        const returnData = req.body;
        returnData.createdBy = req.user._id;

        // Generate posting number if status is Posted
        if (returnData.status === 'Posted') {
            const lastPosted = await WHPurchaseReturn.findOne({ status: 'Posted' })
                .sort({ postingNumber: -1 })
                .select('postingNumber');
            returnData.postingNumber = lastPosted ? lastPosted.postingNumber + 1 : 1;
        }

        const purchaseReturn = await WHPurchaseReturn.create(returnData);

        // Update stock if Posted (REDUCE stock for returns)
        if (returnData.status === 'Posted') {
            for (const item of returnData.items) {
                const whItem = await WHItem.findById(item.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const returnQty = parseFloat(item.quantity) || 0;
                    const newQty = previousQty - returnQty;

                    if (newQty < 0) {
                        throw new Error(`Insufficient stock for item: ${whItem.name}. Available: ${previousQty}, Returning: ${returnQty}`);
                    }

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    // Create Stock Log
                    await WHStockLog.create({
                        item: whItem._id,
                        date: purchaseReturn.returnDate,
                        type: 'out',
                        qty: returnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase_return',
                        refId: purchaseReturn._id,
                        remarks: `Purchase Return #${purchaseReturn.postingNumber || 'Draft'}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        const populated = await WHPurchaseReturn.findById(purchaseReturn._id)
            .populate('supplier', 'supplierName')
            .populate('createdBy', 'name')
            .populate('items.item', 'name itemsCode');

        res.status(201).json({
            success: true,
            message: 'Purchase return created successfully',
            data: populated
        });
    } catch (error) {
        console.error('Error creating purchase return:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all Purchase Returns
exports.getWHPurchaseReturns = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;

        let query = {};

        // Date Filter
        if (startDate || endDate) {
            query.returnDate = {};
            if (startDate) query.returnDate.$gte = new Date(startDate);
            if (endDate) query.returnDate.$lte = new Date(endDate);
        }

        let returns = await WHPurchaseReturn.find(query)
            .populate('supplier', 'supplierName')
            .populate('createdBy', 'name')
            .populate('originalPurchase', 'invoiceNo')
            .sort({ createdAt: -1 });

        // In-memory search filter
        if (search) {
            const searchLower = search.toLowerCase();
            returns = returns.filter(p =>
                (p.returnNo && p.returnNo.toLowerCase().includes(searchLower)) ||
                (p.remarks && p.remarks.toLowerCase().includes(searchLower)) ||
                (p.supplier && p.supplier.supplierName && p.supplier.supplierName.toLowerCase().includes(searchLower)) ||
                (p.postingNumber && String(p.postingNumber).includes(searchLower)) ||
                (p.originalPurchase && p.originalPurchase.invoiceNo && p.originalPurchase.invoiceNo.toLowerCase().includes(searchLower))
            );
        }

        res.json({
            success: true,
            data: returns
        });
    } catch (error) {
        console.error('Error fetching purchase returns:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get single Purchase Return
exports.getWHPurchaseReturnById = async (req, res) => {
    try {
        const purchaseReturn = await WHPurchaseReturn.findById(req.params.id)
            .populate('supplier')
            .populate('createdBy', 'name')
            .populate('originalPurchase', 'invoiceNo')
            .populate({
                path: 'items.item',
                populate: [
                    { path: 'itemClass' },
                    { path: 'company' }
                ]
            });

        if (!purchaseReturn) {
            return res.status(404).json({
                success: false,
                error: 'Purchase return not found'
            });
        }

        res.json({
            success: true,
            data: purchaseReturn
        });
    } catch (error) {
        console.error('Error fetching purchase return:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update Purchase Return
exports.updateWHPurchaseReturn = async (req, res) => {
    try {
        const returnData = req.body;
        const existingReturn = await WHPurchaseReturn.findById(req.params.id);

        if (!existingReturn) {
            return res.status(404).json({
                success: false,
                error: 'Purchase return not found'
            });
        }

        const existingStatus = existingReturn.status;
        const oldItems = JSON.parse(JSON.stringify(existingReturn.items)); // Deep copy old items

        // Generate posting number if changing to Posted
        if (returnData.status === 'Posted' && existingReturn.status !== 'Posted') {
            const lastPosted = await WHPurchaseReturn.findOne({ status: 'Posted' })
                .sort({ postingNumber: -1 })
                .select('postingNumber');
            returnData.postingNumber = lastPosted ? lastPosted.postingNumber + 1 : 1;
        }

        const updated = await WHPurchaseReturn.findByIdAndUpdate(
            req.params.id,
            returnData,
            { returnDocument: 'after', runValidators: true }
        );

        // CASE 1: Transitioning to Posted OR already Posted (Modifying)
        if (updated.status === 'Posted') {
            if (existingStatus === 'Posted') {
                // Optimize: Calculate NET changes to avoid log noise
                const itemMap = {};
                oldItems.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) - (parseFloat(it.quantity) || 0);
                });
                updated.items.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) + (parseFloat(it.quantity) || 0);
                });

                for (const itemId of Object.keys(itemMap)) {
                    const netQty = itemMap[itemId];
                    if (netQty === 0) continue; // No quantity change, no stock log needed

                    const whItem = await WHItem.findById(itemId);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const logType = netQty > 0 ? 'out' : 'in'; // Positive net means more returned (stock decreases)
                        const absQty = Math.abs(netQty);
                        const newQty = logType === 'out' ? previousQty - absQty : previousQty + absQty;

                        if (newQty < 0) {
                            throw new Error(`Insufficient stock for item: ${whItem.name}. Available: ${previousQty}, Request Net: ${absQty}`);
                        }

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }
                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: updated.returnDate,
                            type: logType,
                            qty: absQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'purchase_return',
                            refId: updated._id,
                            remarks: `Updated Purchase Return #${updated.postingNumber} (Net Change)`,
                            createdBy: req.user ? req.user._id : null
                        });
                    }
                }
            } else {
                // Apply NEW impact (Draft -> Posted)
                for (const line of updated.items) {
                    const whItem = await WHItem.findById(line.item);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const returnQty = parseFloat(line.quantity) || 0;
                        const newQty = previousQty - returnQty; // Subtract return

                        if (newQty < 0) {
                            throw new Error(`Insufficient stock for item: ${whItem.name}. Available: ${previousQty}, Returning: ${returnQty}`);
                        }

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }
                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: updated.returnDate,
                            type: 'out',
                            qty: returnQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'purchase_return',
                            refId: updated._id,
                            remarks: `Purchase Return #${updated.postingNumber}`,
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
                    const oldReturnQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty + oldReturnQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: updated.returnDate,
                        type: 'in',
                        qty: oldReturnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase_return',
                        refId: updated._id,
                        remarks: `Unposted Purchase Return #${updated.postingNumber}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        // Final population for response
        const finalPopulated = await WHPurchaseReturn.findById(updated._id)
            .populate('supplier', 'supplierName')
            .populate('createdBy', 'name')
            .populate('items.item', 'name itemsCode');

        res.json({
            success: true,
            message: 'Purchase return updated successfully',
            data: finalPopulated
        });
        return; // Fixed double res.json below if it existed
    } catch (error) {
        console.error('Error updating purchase return:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Delete Purchase Return
exports.deleteWHPurchaseReturn = async (req, res) => {
    try {
        const purchaseReturn = await WHPurchaseReturn.findById(req.params.id);

        if (!purchaseReturn) {
            return res.status(404).json({
                success: false,
                error: 'Purchase return not found'
            });
        }

        // Reverse stock if Posted
        if (purchaseReturn.status === 'Posted') {
            for (const item of purchaseReturn.items) {
                const whItem = await WHItem.findById(item.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const returnQty = parseFloat(item.quantity) || 0;
                    const newQty = previousQty + returnQty;

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
                        date: purchaseReturn.returnDate,
                        type: 'in',
                        qty: returnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'purchase_return',
                        refId: purchaseReturn._id,
                        remarks: `DELETED: Purchase Return #${purchaseReturn.postingNumber || 'Draft'} (REVERSED)`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }

        await WHPurchaseReturn.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Purchase return deleted and stock reversed'
        });
    } catch (error) {
        console.error('Error deleting purchase return:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.getNextReturnNumber = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const count = await WHPurchaseReturn.countDocuments({
            createdAt: { $gte: startOfYear, $lt: endOfYear }
        });

        const nextNo = `PR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        res.status(200).json({ success: true, data: nextNo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
