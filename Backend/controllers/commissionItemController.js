const CommissionItem = require('../models/CommissionItem');
const Store = require('../models/Store');

// @desc    Get all Commission Items
// @route   GET /api/v1/commission-items
exports.getItems = async (req, res) => {
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
            const searchRegex = { $regex: req.query.search, $options: 'i' };
            queryObj.$or = [
                { name: searchRegex },
                { itemsCode: searchRegex },
                { barcode: searchRegex }
            ];
        }

        // Finding resource
        query = CommissionItem.find(queryObj)
            .populate('category', 'name')
            .populate('supplier', 'name');

        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-createdAt');
        }

        // Executing query
        const items = await query;

        res.status(200).json({ success: true, count: items.length, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single Commission Item
// @route   GET /api/v1/commission-items/:id
exports.getItem = async (req, res) => {
    try {
        const item = await CommissionItem.findById(req.params.id)
            .populate('category', 'name')
            .populate('supplier', 'name');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create Commission Item
// @route   POST /api/v1/commission-items
exports.createItem = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        // Ensure seqId is set
        if (!req.body.seqId) {
            const lastItem = await CommissionItem.findOne().sort({ seqId: -1 });
            req.body.seqId = lastItem ? lastItem.seqId + 1 : 1;
        }

        const item = await CommissionItem.create(req.body);
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        console.error('Create Commission Item Error:', error);
        res.status(400).json({ success: false, message: 'Error creating item', error: error.message });
    }
};

// @desc    Update Commission Item
// @route   PUT /api/v1/commission-items/:id
exports.updateItem = async (req, res) => {
    try {
        let item = await CommissionItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        item = await CommissionItem.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        console.error('Update Commission Item Error:', error);
        res.status(400).json({ success: false, message: 'Error updating item', error: error.message });
    }
};

// @desc    Delete Commission Item
// @route   DELETE /api/v1/commission-items/:id
exports.deleteItem = async (req, res) => {
    try {
        const item = await CommissionItem.findByIdAndDelete(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.status(200).json({ success: true, message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Next Seq ID and Item Code
// @route   GET /api/v1/commission-items/next-seq
exports.getNextSeqId = async (req, res) => {
    try {
        // Get Next Seq ID
        const lastItem = await CommissionItem.findOne().sort({ seqId: -1 });
        const nextId = lastItem ? lastItem.seqId + 1 : 1;

        // Get Next Item Code (Auto-generate starting from 1)
        let nextCode = 1;

        try {
            const result = await CommissionItem.aggregate([
                {
                    $match: {
                        itemsCode: { $regex: /^\d{1,9}$/ } // Match numeric codes
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

            if (result.length > 0) {
                nextCode = result[0].maxCode + 1;
            }
        } catch (aggError) {
            console.error('Aggregation error in getNextSeqId:', aggError);
            // Fallback
            const items = await CommissionItem.find({ itemsCode: { $regex: /^\d{1,9}$/ } })
                .collation({ locale: "en_US", numericOrdering: true })
                .sort({ itemsCode: -1 })
                .limit(1);

            if (items.length > 0) {
                const maxCode = parseInt(items[0].itemsCode);
                if (!isNaN(maxCode)) {
                    nextCode = maxCode + 1;
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                seqId: nextId,
                itemCode: nextCode.toString().padStart(2, '0') // Start from 01
            }
        });
    } catch (error) {
        console.error('Error in getNextSeqId:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
