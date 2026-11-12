const WHSaleReturn = require('../models/WHSaleReturn');
const WHItem = require('../models/WHItem');
const WHCustomer = require('../models/WHCustomer');
const WHStockLog = require('../models/WHStockLog');
const { addLedgerEntry, deleteLedgerEntry } = require('../utils/whLedgerUtils');


// @desc    Create new WH Sale Return
// @route   POST /api/v1/wh-sale-returns
exports.createWHSaleReturn = async (req, res) => {
    try {
        const returnData = {
            ...req.body,
            createdBy: req.user ? req.user._id : null
        };

        const saleReturn = await WHSaleReturn.create(returnData);

        // Update Stock if Status is Posted
        if (saleReturn.status === 'Posted') {
            for (const line of saleReturn.items) {
                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const returnQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty + returnQty; // Return increases stock

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
                        date: saleReturn.returnDate,
                        type: 'in',
                        qty: returnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'sales_return',
                        refId: saleReturn._id,
                        remarks: `Sale Return #${saleReturn.returnNo}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }

            // Add Ledger Entry for Posted Sale Return
            await addLedgerEntry({
                customer: saleReturn.customer,
                returnDate: saleReturn.returnDate,
                description: `Sale Return - Memo #${saleReturn.returnNo}`,
                refType: 'SaleReturn',
                refId: saleReturn._id,
                debit: 0,
                credit: saleReturn.netTotal,
                createdBy: req.user ? req.user._id : null
            });
        }


        res.status(201).json({ success: true, data: saleReturn });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all WH Sale Returns
// @desc    Get all WH Sale Returns
// @route   GET /api/v1/wh-sale-returns
exports.getWHSaleReturns = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;
        let query = {};

        // Date Filtering
        if (startDate || endDate) {
            query.returnDate = {};
            if (startDate) query.returnDate.$gte = new Date(startDate);
            if (endDate) query.returnDate.$lte = new Date(endDate);
        }

        let returns = await WHSaleReturn.find(query)
            .populate({
                path: 'customer',
                select: 'customerName customerCategory',
                populate: { path: 'customerCategory', select: 'name' }
            })
            .populate('createdBy', 'name')
            .sort({ returnDate: -1, createdAt: -1 });

        // In-memory Search Filtering
        if (search) {
            const searchLower = search.toLowerCase();
            returns = returns.filter(ret =>
                (ret.returnNo && ret.returnNo.toLowerCase().includes(searchLower)) ||
                (ret.remarks && ret.remarks.toLowerCase().includes(searchLower)) ||
                (ret.customer && ret.customer.customerName && ret.customer.customerName.toLowerCase().includes(searchLower))
            );
        }

        res.status(200).json({ success: true, count: returns.length, data: returns });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get single WH Sale Return
// @route   GET /api/v1/wh-sale-returns/:id
exports.getWHSaleReturn = async (req, res) => {
    try {
        const saleReturn = await WHSaleReturn.findById(req.params.id)
            .populate('customer')
            .populate('whCategory')
            .populate({
                path: 'items.item',
                populate: [
                    { path: 'itemClass' },
                    { path: 'company' }
                ]
            });
        if (!saleReturn) return res.status(404).json({ success: false, error: 'Return not found' });
        res.status(200).json({ success: true, data: saleReturn });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update WH Sale Return
// @route   PUT /api/v1/wh-sale-returns/:id
exports.updateWHSaleReturn = async (req, res) => {
    try {
        let saleReturn = await WHSaleReturn.findById(req.params.id);
        if (!saleReturn) return res.status(404).json({ success: false, error: 'Return not found' });

        const existingStatus = saleReturn.status;
        const oldItems = JSON.parse(JSON.stringify(saleReturn.items)); // Deep copy old items

        saleReturn = await WHSaleReturn.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

        // CASE 1: Transitioning to Posted OR already Posted (Modifying)
        if (saleReturn.status === 'Posted') {
            if (existingStatus === 'Posted') {
                // Optimize: Calculate NET changes to avoid log noise
                const itemMap = {};
                oldItems.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) - (parseFloat(it.quantity) || 0);
                });
                saleReturn.items.forEach(it => {
                    const id = it.item.toString();
                    itemMap[id] = (itemMap[id] || 0) + (parseFloat(it.quantity) || 0);
                });

                for (const itemId of Object.keys(itemMap)) {
                    const netQty = itemMap[itemId];
                    if (netQty === 0) continue; // No quantity change, no stock log needed

                    const whItem = await WHItem.findById(itemId);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const logType = netQty > 0 ? 'in' : 'out'; // Positive net means more returned (stock increases)
                        const absQty = Math.abs(netQty);
                        const newQty = logType === 'in' ? previousQty + absQty : previousQty - absQty;

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }
                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: saleReturn.returnDate,
                            type: logType,
                            qty: absQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'sales_return',
                            refId: saleReturn._id,
                            remarks: `Updated Sale Return #${saleReturn.returnNo} (Net Change)`,
                            createdBy: req.user ? req.user._id : null
                        });
                    }
                }
            } else {
                // Apply NEW impact (Draft -> Posted)
                for (const line of saleReturn.items) {
                    const whItem = await WHItem.findById(line.item);
                    if (whItem) {
                        const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                        const returnQty = parseFloat(line.quantity) || 0;
                        const newQty = previousQty + returnQty; // Add sale return

                        if (whItem.stock && whItem.stock.length > 0) {
                            whItem.stock[0].quantity = newQty;
                        } else {
                            whItem.stock = [{ quantity: newQty, opening: 0 }];
                        }
                        whItem.markModified('stock');
                        await whItem.save();

                        await WHStockLog.create({
                            item: whItem._id,
                            date: saleReturn.returnDate,
                            type: 'in',
                            qty: returnQty,
                            previousQty: previousQty,
                            newQty: newQty,
                            refType: 'sales_return',
                            refId: saleReturn._id,
                            remarks: `Sale Return #${saleReturn.returnNo}`,
                            createdBy: req.user ? req.user._id : null
                        });
                    }
                }
            }

            // Sync Ledger for Posted Sale Return
            await deleteLedgerEntry(saleReturn._id, {
                customer: saleReturn.customer,
                debit: 0,
                credit: saleReturn.netTotal
            });
            await addLedgerEntry({
                customer: saleReturn.customer,
                date: saleReturn.returnDate,
                description: `Sale Return (Updated) - Memo #${saleReturn.returnNo}`,
                refType: 'SaleReturn',
                refId: saleReturn._id,
                debit: 0,
                credit: saleReturn.netTotal,
                createdBy: req.user ? req.user._id : null
            });
        }

        // CASE 2: Transitioning from Posted to Draft
        else if (existingStatus === 'Posted') {
            await deleteLedgerEntry(saleReturn._id, {
                customer: saleReturn.customer,
                debit: 0,
                credit: saleReturn.netTotal
            });
            for (const line of oldItems) {

                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const oldReturnQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty - oldReturnQty;

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: saleReturn.returnDate,
                        type: 'out',
                        qty: oldReturnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'sales_return',
                        refId: saleReturn._id,
                        remarks: `Unposted Sale Return #${saleReturn.returnNo}`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
        }
        res.status(200).json({ success: true, data: saleReturn });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete WH Sale Return
// @route   DELETE /api/v1/wh-sale-returns/:id
exports.deleteWHSaleReturn = async (req, res) => {
    try {
        const saleReturn = await WHSaleReturn.findById(req.params.id);
        if (!saleReturn) return res.status(404).json({ success: false, error: 'Return not found' });

        if (saleReturn.status === 'Posted') {
            for (const line of saleReturn.items) {
                const whItem = await WHItem.findById(line.item);
                if (whItem) {
                    const previousQty = (whItem.stock && whItem.stock.length > 0) ? whItem.stock[0].quantity : 0;
                    const returnQty = parseFloat(line.quantity) || 0;
                    const newQty = previousQty - returnQty; // Reversing return decreases stock

                    if (whItem.stock && whItem.stock.length > 0) {
                        whItem.stock[0].quantity = newQty;
                    } else {
                        whItem.stock = [{ quantity: newQty, opening: 0 }];
                    }
                    whItem.markModified('stock');
                    await whItem.save();

                    await WHStockLog.create({
                        item: whItem._id,
                        date: saleReturn.returnDate,
                        type: 'out',
                        qty: returnQty,
                        previousQty: previousQty,
                        newQty: newQty,
                        refType: 'sales_return',
                        refId: saleReturn._id,
                        remarks: `DELETED: Sale Return #${saleReturn.returnNo} (REVERSED)`,
                        createdBy: req.user ? req.user._id : null
                    });
                }
            }
            await deleteLedgerEntry(saleReturn._id, {
                customer: saleReturn.customer,
                debit: 0,
                credit: saleReturn.netTotal
            });
        }

        await saleReturn.deleteOne();
        res.status(200).json({ success: true, message: 'Return deleted and stock reversed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get next return number
// @route   GET /api/v1/wh-sale-returns/next-number
exports.getNextReturnNumber = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const count = await WHSaleReturn.countDocuments({
            createdAt: { $gte: startOfYear, $lt: endOfYear }
        });

        const nextNo = `SR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
        res.status(200).json({ success: true, data: nextNo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
