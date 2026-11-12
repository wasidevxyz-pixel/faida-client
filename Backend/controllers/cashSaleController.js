const CashSale = require('../models/CashSale');
const Bank = require('../models/Bank');

// @desc    Get cash sales
// @route   GET /api/v1/cash-sales
// @access  Private
exports.getCashSales = async (req, res) => {
    try {
        const query = {};

        // Date Filter
        if (req.query.startDate && req.query.endDate) {
            const start = new Date(req.query.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.endDate);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        } else if (req.query.date) {
            const start = new Date(req.query.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.date);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        }

        // Branch Filter
        if (req.query.branch && req.query.branch !== 'All Branches' && req.query.branch !== 'all') {
            query.branch = req.query.branch;
        }

        const sales = await CashSale.find(query)
            .populate('department', '_id name')
            .populate('bank') // Populate full bank object to ensure bankName is available
            .sort({ date: -1, createdAt: -1 });


        res.status(200).json({ success: true, count: sales.length, data: sales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get single cash sale
// @route   GET /api/v1/cash-sales/:id
// @access  Private
exports.getCashSale = async (req, res) => {
    try {
        const sale = await CashSale.findById(req.params.id).populate('department').populate('bank');
        if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
        res.status(200).json({ success: true, data: sale });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Create cash sale
// @route   POST /api/v1/cash-sales
// @access  Private
exports.createCashSale = async (req, res) => {
    try {
        const payload = req.body;

        // Handle Array (Bulk Insert)
        if (Array.isArray(payload)) {
            // Optional: Logic to Auto-Gen Invoice Nos for each if missing
            // For now assume frontend validates or we map it
            const count = await CashSale.countDocuments();
            let currentInvoice = count + 1;

            const toInsert = payload.map((item, idx) => {
                if (!item.invoiceNo) {
                    item.invoiceNo = (currentInvoice + idx).toString();
                }
                return item;
            });

            const sales = await CashSale.create(toInsert);
            res.status(201).json({ success: true, data: sales, count: sales.length });
        } else {
            // Handle Single Object
            if (!payload.invoiceNo) {
                const count = await CashSale.countDocuments();
                payload.invoiceNo = (count + 1).toString();
            }
            const sale = await CashSale.create(payload);
            res.status(201).json({ success: true, data: sale });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update cash sale
// @route   PUT /api/v1/cash-sales/:id
// @access  Private
exports.updateCashSale = async (req, res) => {
    try {
        const sale = await CashSale.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
        res.status(200).json({ success: true, data: sale });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete cash sale
// @route   DELETE /api/v1/cash-sales/:id
// @access  Private
exports.deleteCashSale = async (req, res) => {
    try {
        const sale = await CashSale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
        await sale.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
