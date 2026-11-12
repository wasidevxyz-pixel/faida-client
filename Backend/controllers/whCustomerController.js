const WHCustomer = require('../models/WHCustomer');
const Store = require('../models/Store');
const WHLedger = require('../models/WHLedger');
const asyncHandler = require('../middleware/async');


// @desc    Get next customer code
// @route   GET /api/v1/wh-customers/next-code
// @access  Private
exports.getNextCode = async (req, res) => {
    try {
        const lastCustomer = await WHCustomer.findOne().sort({ code: -1 });
        let nextCode = '01';

        if (lastCustomer && lastCustomer.code) {
            const currentCode = parseInt(lastCustomer.code);
            if (!isNaN(currentCode)) {
                nextCode = (currentCode + 1).toString().padStart(2, '0');
            }
        }

        res.status(200).json({
            success: true,
            data: nextCode
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating next code',
            error: error.message
        });
    }
};

// @desc    Get all WH customers
// @route   GET /api/v1/wh-customers
// @access  Private
exports.getWHCustomers = async (req, res) => {
    try {
        const { branch, category, customerCategory, search } = req.query;

        let query = {};
        if (branch) {
            query.branch = branch;
        }
        if (category || customerCategory) {
            query.customerCategory = category || customerCategory;
        }
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { customerName: regex },
                { code: regex },
                { phone: regex },
                { mobile: regex }
            ];
        }

        const rawCustomers = await WHCustomer.find(query)
            .populate('branch', 'name')
            .populate('customerCategory', 'name')
            .populate('city', 'name')
            .populate('customerType', 'name')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const customers = rawCustomers.map(c => {
            const cName = c.customerName || c.name || '';
            const cBal = (c.currentBalance !== undefined && c.currentBalance !== null)
                ? Number(c.currentBalance)
                : ((c.openingBalance !== undefined && c.openingBalance !== null) ? Number(c.openingBalance) : 0);
            return {
                ...c,
                customerName: cName,
                name: cName,
                balance: cBal,
                currentBalance: cBal
            };
        });

        res.status(200).json({
            success: true,
            count: customers.length,
            data: customers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching WH customers',
            error: error.message
        });
    }
};

// @desc    Get single WH customer
// @route   GET /api/v1/wh-customers/:id
// @access  Private
exports.getWHCustomer = async (req, res) => {
    try {
        const customer = await WHCustomer.findById(req.params.id)
            .populate('branch', 'name')
            .populate('customerCategory', 'name')
            .populate('city', 'name')
            .populate('customerType', 'name')
            .populate('createdBy', 'name email');

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'WH Customer not found'
            });
        }

        const cBal = (customer.currentBalance !== undefined && customer.currentBalance !== null)
            ? Number(customer.currentBalance)
            : ((customer.openingBalance !== undefined && customer.openingBalance !== null) ? Number(customer.openingBalance) : 0);
        const dataObj = customer.toObject ? customer.toObject() : { ...customer };
        dataObj.balance = cBal;
        dataObj.currentBalance = cBal;

        res.status(200).json({
            success: true,
            data: dataObj
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching WH customer',
            error: error.message
        });
    }
};

// @desc    Create new WH customer
// @route   POST /api/v1/wh-customers
// @access  Private
exports.createWHCustomer = async (req, res) => {
    try {
        // Add user to req.body
        req.body.createdBy = req.user.id;

        // Initialize current balance with opening balance
        req.body.currentBalance = req.body.openingBalance || 0;
        const customer = await WHCustomer.create(req.body);

        // Create Opening Ledger Entry if balance is set
        if (req.body.openingBalance && req.body.openingBalance !== 0) {
            await WHLedger.create({
                customer: customer._id,
                date: new Date('2000-01-01'), // Old date to ensure it's always opening balance
                description: 'Opening Balance',
                refType: 'Opening',
                refId: customer._id,
                debit: req.body.openingBalance > 0 ? req.body.openingBalance : 0,
                credit: req.body.openingBalance < 0 ? Math.abs(req.body.openingBalance) : 0,
                createdBy: req.user.id
            });

            // Re-sync after opening entry
            const ledgerEntries = await WHLedger.find({ customer: customer._id });
            customer.currentBalance = ledgerEntries.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);
            await customer.save();
        }

        res.status(201).json({
            success: true,
            message: 'WH Customer created successfully',
            data: customer
        });
    } catch (error) {
        console.error('Create WH Customer Error:', error);
        res.status(400).json({
            success: false,
            message: 'Error creating WH customer',
            error: error.message
        });
    }
};

// @desc    Update WH customer
// @route   PUT /api/v1/wh-customers/:id
// @access  Private
exports.updateWHCustomer = async (req, res) => {
    try {
        let customer = await WHCustomer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'WH Customer not found'
            });
        }

        customer = await WHCustomer.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        // Update or Create Opening Ledger Entry
        const openingAmount = req.body.openingBalance || 0;
        let openingEntry = await WHLedger.findOne({ customer: customer._id, refType: 'Opening' });

        if (openingEntry) {
            openingEntry.debit = openingAmount > 0 ? openingAmount : 0;
            openingEntry.credit = openingAmount < 0 ? Math.abs(openingAmount) : 0;
            openingEntry.date = new Date('2000-01-01'); // Ensure date is always in the past
            await openingEntry.save();
        } else if (openingAmount !== 0) {
            await WHLedger.create({
                customer: customer._id,
                date: new Date('2000-01-01'),
                description: 'Opening Balance',
                refType: 'Opening',
                refId: customer._id,
                debit: openingAmount > 0 ? openingAmount : 0,
                credit: openingAmount < 0 ? Math.abs(openingAmount) : 0,
                createdBy: req.user.id
            });
        }

        // Re-sync current balance after any update
        const ledgerEntries = await WHLedger.find({ customer: customer._id });
        const total = ledgerEntries.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);
        customer.currentBalance = total;
        await customer.save();

        res.status(200).json({
            success: true,
            message: 'WH Customer updated successfully',
            data: customer
        });
    } catch (error) {
        console.error('Update WH Customer Error:', error);
        res.status(400).json({
            success: false,
            message: 'Error updating WH customer',
            error: error.message
        });
    }
};

// @desc    Delete WH customer
// @route   DELETE /api/v1/wh-customers/:id
// @access  Private
exports.deleteWHCustomer = async (req, res) => {
    try {
        const customer = await WHCustomer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'WH Customer not found'
            });
        }

        await WHLedger.deleteMany({ customer: customer._id, refType: 'Opening' });
        await customer.deleteOne();

        res.status(200).json({
            success: true,
            message: 'WH Customer deleted successfully',
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting WH customer',
            error: error.message
        });
    }
};

// @desc    Sync customer balance with ledger
// @route   POST /api/v1/wh-customers/:id/sync
// @access  Private
exports.syncWHCustomerBalance = asyncHandler(async (req, res) => {
    const customer = await WHCustomer.findById(req.params.id);
    if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Get all ledger entries
    const ledgerEntries = await WHLedger.find({ customer: req.params.id });

    // Sum them up
    const total = ledgerEntries.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);

    // Check if there's an 'Opening' refType to set the openingBalance field
    const openingEntry = ledgerEntries.find(e => e.refType === 'Opening');
    if (openingEntry) {
        customer.openingBalance = (openingEntry.debit || 0) - (openingEntry.credit || 0);
    }

    customer.currentBalance = total;
    await customer.save();

    res.status(200).json({
        success: true,
        message: 'Balance synced with ledger',
        newBalance: total
    });
});

// @desc    Sync ALL customer balances with ledger
// @route   POST /api/v1/wh-customers/sync-all
// @access  Private
exports.syncAllWHCustomerBalances = asyncHandler(async (req, res) => {
    const customers = await WHCustomer.find();
    let updatedCount = 0;
    const WHLedger = require('../models/WHLedger'); // Ensure model is available

    for (const customer of customers) {
        const ledgerEntries = await WHLedger.find({ customer: customer._id });
        const total = ledgerEntries.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);
        const openingEntry = ledgerEntries.find(e => e.refType === 'Opening');

        if (openingEntry) {
            customer.openingBalance = (openingEntry.debit || 0) - (openingEntry.credit || 0);
        } else {
            customer.openingBalance = 0;
        }

        customer.currentBalance = total;
        await customer.save();
        updatedCount++;
    }

    res.status(200).json({
        success: true,
        message: `Synced ${updatedCount} customers`,
        count: updatedCount
    });
});

