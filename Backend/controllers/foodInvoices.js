const FoodInvoice = require('../models/FoodInvoice');

// @desc   Get all food invoice records (with optional month/date filter)
// @route  GET /api/v1/food-invoices
// @access Private
exports.getFoodInvoices = async (req, res) => {
    try {
        const { month, from, to } = req.query;
        let filter = {};

        if (month) {
            // month format: YYYY-MM
            const [year, mo] = month.split('-').map(Number);
            // Use Date.UTC to create dates in UTC
            const start = new Date(Date.UTC(year, mo - 1, 1)); // Start of the month in UTC
            const end   = new Date(Date.UTC(year, mo, 0, 23, 59, 59, 999)); // End of the month in UTC
            filter.date = { $gte: start, $lte: end };
        } else if (from || to) {
            filter.date = {};
            // Append 'T00:00:00Z' or 'T23:59:59.999Z' to ensure UTC start/end of day
            if (from) filter.date.$gte = new Date(from + 'T00:00:00Z');
            if (to)   filter.date.$lte = new Date(to + 'T23:59:59.999Z');
        }

        const records = await FoodInvoice.find(filter).sort({ date: 1 });
        res.status(200).json({ success: true, count: records.length, data: records });
    } catch (err) {
        console.error('getFoodInvoices error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   Create or update food invoice record for a date
// @route  POST /api/v1/food-invoices
// @access Private
exports.createFoodInvoice = async (req, res) => {
    try {
        const { date, meals } = req.body;
        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        // Store date as UTC noon to avoid timezone-based day shifts
        const dateObj = new Date(date + 'T12:00:00Z');

        // Upsert: update if exists for same date, otherwise create
        // Query for the entire day in UTC
        const record = await FoodInvoice.findOneAndUpdate(
            { date: { $gte: new Date(date + 'T00:00:00Z'), $lte: new Date(date + 'T23:59:59.999Z') } },
            { date: dateObj, meals, createdBy: req.user ? req.user.id : undefined },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: record });
    } catch (err) {
        console.error('createFoodInvoice error:', err);
        if (err.code === 11000) {
            // Duplicate - update instead
            try {
                const { date, meals } = req.body;
                // Query for the entire day in UTC
                
const record = await FoodInvoice.findOneAndUpdate(
                    { date: { $gte: new Date(date + 'T00:00:00Z'), $lte: new Date(date + 'T23:59:59.999Z') } },
                    { $set: { meals } },
                    { returnDocument: 'after' }
                );
                return res.status(200).json({ success: true, data: record });
            } catch (e) {
                return res.status(500).json({ success: false, message: e.message });
            }
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   Delete food invoice record
// @route  DELETE /api/v1/food-invoices/:id
// @access Private
exports.deleteFoodInvoice = async (req, res) => {
    try {
        const record = await FoodInvoice.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
        res.status(200).json({ success: true, message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── GENERATED INVOICES ──
const GeneratedFoodInvoice = require('../models/GeneratedFoodInvoice');

// @desc   Get all generated food invoices
// @route  GET /api/v1/food-invoices/generated
// @access Private
exports.getGeneratedInvoices = async (req, res) => {
    try {
        const invoices = await GeneratedFoodInvoice.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: invoices.length, data: invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   Save a newly generated food invoice
// @route  POST /api/v1/food-invoices/generated
// @access Private
exports.saveGeneratedInvoice = async (req, res) => {
    try {
        const invoiceData = req.body;
        if (!invoiceData.invoiceNumber) return res.status(400).json({ success: false, message: 'Invoice number is required' });

        // User Ref
        if (req.user) invoiceData.createdBy = req.user.id;

        const record = await GeneratedFoodInvoice.create(invoiceData);
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        console.error('saveGeneratedInvoice error:', err);
        if (err.code === 11000) return res.status(400).json({ success: false, message: 'Invoice number already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   Get next available invoice number
// @route  GET /api/v1/food-invoices/next-number
// @access Private
exports.getNextInvoiceNumber = async (req, res) => {
    try {
        const last = await GeneratedFoodInvoice.findOne().sort({ createdAt: -1 });
        let next = 'INV-0001';
        if (last && last.invoiceNumber) {
            const matches = last.invoiceNumber.match(/(\d+)$/);
            if (matches) {
                const num = parseInt(matches[0]);
                const base = last.invoiceNumber.replace(/\d+$/, '');
                next = base + (num + 1).toString().padStart(matches[0].length, '0');
            }
        }
        res.status(200).json({ success: true, data: next });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   Delete a generated invoice record
// @route  DELETE /api/v1/food-invoices/generated/:id
// @access Private
exports.deleteGeneratedInvoice = async (req, res) => {
    try {
        const record = await GeneratedFoodInvoice.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: 'Invoice not found' });
        res.status(200).json({ success: true, message: 'Invoice record deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
