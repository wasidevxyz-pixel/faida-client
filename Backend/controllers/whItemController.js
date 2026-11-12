const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Store = require('../models/Store');

// @desc    Get all WH Items
// @route   GET /api/v1/wh-items
exports.getWHItems = async (req, res) => {
    try {
        let query;

        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude
        const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
        removeFields.forEach(param => delete reqQuery[param]);

        let queryObj;
        try {
            let queryStr = JSON.stringify(reqQuery);
            queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
            queryObj = JSON.parse(queryStr);
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: 'Invalid filter parameters' });
        }

        // Add search support
        if (req.query.search) {
            const searchTerm = req.query.search.trim();
            const searchRegex = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            queryObj.$or = [
                { name: { $regex: searchRegex, $options: 'i' } },
                { itemsCode: { $regex: searchRegex, $options: 'i' } },
                { barcode: { $regex: searchRegex, $options: 'i' } }
            ];
        }

        // Filter inactive items by default
        if (req.query.showInactive !== 'true') {
            queryObj.isActive = { $ne: false };
        } else {
            // If showInactive is true, we don't want the default filter, 
            // but we also remove it from reqQuery so it doesn't get used twice
            delete queryObj.showInactive;
        }

        if (req.user && req.user.role !== 'admin') {
            if (req.user.allowedWHItemCategories && req.user.allowedWHItemCategories.length > 0) {
                if (queryObj.category) {
                    if (queryObj.category.$in) {
                        const requestedCats = Array.isArray(queryObj.category.$in) ? queryObj.category.$in : [queryObj.category.$in];
                        const allowedIds = req.user.allowedWHItemCategories.map(id => id.toString());
                        const isAllowed = requestedCats.every(catId => allowedIds.includes(catId.toString()));
                        if (!isAllowed) {
                            return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
                        }
                    } else {
                        const allowedIds = req.user.allowedWHItemCategories.map(id => id.toString());
                        if (!allowedIds.includes(queryObj.category.toString())) {
                            return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
                        }
                    }
                } else {
                    queryObj.category = { $in: req.user.allowedWHItemCategories };
                }
            } else if (!req.posCatalog) {
                return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
            }
        }

        // ─── PERFORMANCE OPTIMIZATION ───
        const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        // Executing query and count in parallel
        const [items, totalCount] = await Promise.all([
            WHItem.find(queryObj)
                .select('name itemsCode barcode company category itemClass subClass supplier stock isActive createdAt costPrice salePrice retailPrice incentive')
                .populate('company', 'name')
                .populate('category', 'name')
                .populate('itemClass', 'name')
                .populate('subClass', 'name')
                .populate('supplier', 'supplierName')
                .populate('stock.store', 'name')
                .sort(req.query.sort ? req.query.sort.split(',').join(' ') : '-createdAt')
                .skip(skip)
                .limit(limit)
                .lean(),
            WHItem.countDocuments(queryObj)
        ]);

        res.status(200).json({
            success: true,
            count: items.length,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            data: items
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWHPOSItems = async (req, res) => {
    req.posCatalog = true;
    return exports.getWHItems(req, res);
};

// @desc    Get single WH Item
// @route   GET /api/v1/wh-items/:id
exports.getWHItem = async (req, res) => {
    try {
        const item = await WHItem.findById(req.params.id)
            .populate('company', 'name')
            .populate('category', 'name')
            .populate('itemClass', 'name')
            .populate('subClass', 'name')
            .populate('supplier', 'supplierName')
            .populate('stock.store', 'name');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWHItemByBarcode = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        if (!code) {
            return res.status(400).json({ success: false, message: 'Barcode is required' });
        }

        const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const query = {
            isActive: { $ne: false },
            $or: [
                { barcode: { $regex: `^${escapedCode}$`, $options: 'i' } },
                { itemsCode: { $regex: `^${escapedCode}$`, $options: 'i' } }
            ]
        };
        if (req.user && req.user.role !== 'admin') {
            const allowedCategories = req.user.allowedWHItemCategories || [];
            if (allowedCategories.length === 0) {
                return res.status(404).json({ success: false, message: `Item not found for code ${code}` });
            }
            query.category = { $in: allowedCategories };
        }

        const item = await WHItem.findOne(query).lean();

        if (!item) {
            return res.status(404).json({ success: false, message: `Item not found for code ${code}` });
        }

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create WH Item
// @route   POST /api/v1/wh-items
exports.createWHItem = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        // Enforce category restrictions for non-admins
        if (req.user && req.user.role !== 'admin') {
            if (req.user.allowedWHItemCategories && req.user.allowedWHItemCategories.length > 0) {
                const allowedIds = req.user.allowedWHItemCategories.map(id => id.toString());
                if (!allowedIds.includes(req.body.category.toString())) {
                    return res.status(403).json({ success: false, message: 'You are not authorized to create items in this category' });
                }
            } else {
                return res.status(403).json({ success: false, message: 'You are not authorized to create items in any category' });
            }
        }

        // Ensure seqId is set
        if (!req.body.seqId) {
            const lastItem = await WHItem.findOne().sort({ seqId: -1 });
            req.body.seqId = lastItem ? lastItem.seqId + 1 : 1;
        }

        const item = await WHItem.create(req.body);
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        console.error('Create WH Item Error:', error);
        res.status(400).json({ success: false, message: 'Error creating item', error: error.message });
    }
};

// @desc    Update WH Item
// @route   PUT /api/v1/wh-items/:id
exports.updateWHItem = async (req, res) => {
    try {
        let item = await WHItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Enforce category restrictions for non-admins if they try to change the category
        if (req.body.category && req.user && req.user.role !== 'admin') {
            if (req.user.allowedWHItemCategories && req.user.allowedWHItemCategories.length > 0) {
                const allowedIds = req.user.allowedWHItemCategories.map(id => id.toString());
                if (!allowedIds.includes(req.body.category.toString())) {
                    return res.status(403).json({ success: false, message: 'You are not authorized to move item to this category' });
                }
            } else {
                return res.status(403).json({ success: false, message: 'You are not authorized to assign items to any category' });
            }
        }

        // Stock Validation for Inactivation
        if (req.body.isActive === false || req.body.isActive === 'false') {
            const totalStock = (item.stock || []).reduce((acc, s) => acc + (s.quantity || 0), 0);
            if (totalStock > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Item cannot be inactivated. Current stock available: ${totalStock}`
                });
            }
        }

        item = await WHItem.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        console.error('Update WH Item Error:', error);
        res.status(400).json({ success: false, message: 'Error updating item', error: error.message });
    }
};

// @desc    Delete WH Item
// @route   DELETE /api/v1/wh-items/:id
exports.deleteWHItem = async (req, res) => {
    try {
        const item = await WHItem.findByIdAndDelete(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.status(200).json({ success: true, message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Next Seq ID and Item Code
// @route   GET /api/v1/wh-items/next-seq
exports.getNextSeqId = async (req, res) => {
    try {
        // Get Next Seq ID
        const lastItem = await WHItem.findOne().sort({ seqId: -1 });
        const nextId = lastItem ? lastItem.seqId + 1 : 1;

        // Get Next Item Code (Auto-generate starting from 2000)
        let nextCode = 2000;

        try {
            const result = await WHItem.aggregate([
                {
                    $match: {
                        itemsCode: { $regex: /^\d{1,9}$/ } // Match numeric codes up to 9 digits (exclude EAN-13/UPC)
                    }
                },
                {
                    $project: {
                        codeNum: { $toInt: "$itemsCode" }
                    }
                },
                {
                    $group: {
                        _id: null,
                        maxCode: { $max: "$codeNum" }
                    }
                }
            ]);

            if (result.length > 0 && result[0].maxCode >= 2000) {
                nextCode = result[0].maxCode + 1;
            }
        } catch (aggError) {
            console.error('Aggregation error in getNextSeqId:', aggError);
            // If aggregation fails, try simple approach with length check
            const items = await WHItem.find({ itemsCode: { $regex: /^\d{1,9}$/ } })
                .collation({ locale: "en_US", numericOrdering: true }) // Ensure numeric sort
                .sort({ itemsCode: -1 })
                .limit(1);

            if (items.length > 0) {
                const maxCode = parseInt(items[0].itemsCode);
                if (!isNaN(maxCode) && maxCode >= 2000) {
                    nextCode = maxCode + 1;
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                seqId: nextId,
                itemCode: nextCode.toString()
            }
        });
    } catch (error) {
        console.error('Error in getNextSeqId:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Import Stock from Excel (Matching by Name)
// @route   POST /api/v1/wh-items/import-stock
exports.importStock = async (req, res) => {
    try {
        const { stockData } = req.body;
        if (!stockData || !Array.isArray(stockData)) {
            return res.status(400).json({ success: false, message: 'Invalid stock data' });
        }

        // Get default store (first active store)
        let store = await Store.findOne({ isActive: true });
        if (!store) {
            return res.status(400).json({ success: false, message: 'No active store found to import stock' });
        }

        let importCount = 0;
        let skipCount = 0;
        let errors = [];

        for (const row of stockData) {
            try {
                const itemName = row.ItemName || row.name;
                const barcode = row.Barcode || row.barcode;
                const stockQty = parseFloat(row['Stock in Hand'] || row.stock || 0);

                if (!itemName) {
                    skipCount++;
                    continue;
                }

                // Search by name only as requested
                const item = await WHItem.findOne({ name: { $regex: new RegExp(`^${itemName}$`, 'i') } });

                if (!item) {
                    skipCount++;
                    continue;
                }

                const prevQty = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;

                // Update or Init Stock
                if (item.stock && item.stock.length > 0) {
                    item.stock[0].opening = 0; // Use 0 because we create a log instead
                    item.stock[0].quantity = stockQty;
                } else {
                    item.stock = [{
                        store: store._id,
                        quantity: stockQty,
                        opening: 0 // Use 0 because we create a log instead
                    }];
                }

                item.markModified('stock');
                await item.save();

                // Create Stock Log
                await WHStockLog.create({
                    item: item._id,
                    date: new Date(),
                    type: 'in',
                    qty: stockQty,
                    previousQty: prevQty,
                    newQty: stockQty,
                    refType: 'purchase', // Using purchase as a generic refType for opening stock if 'Opening' not available
                    refId: item._id, // Self-reference for opening
                    remarks: 'Opening Stock Import from Excel',
                    createdBy: req.user.id
                });

                importCount++;
            } catch (err) {
                console.error(`Error importing item ${row.ItemName}:`, err);
                errors.push(`${row.ItemName}: ${err.message}`);
            }
        }

        res.status(200).json({
            success: true,
            message: `Import completed: ${importCount} updated, ${skipCount} skipped/not found, ${errors.length} errors`,
            details: { importCount, skipCount, errorCount: errors.length, errors }
        });
    } catch (error) {
        console.error('Import Stock Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
