const CustomerDemand = require('../models/CustomerDemand');

exports.getCustomerDemands = async (req, res) => {
    try {
        const query = {};
        if (req.query.startDate && req.query.endDate) {
            query.date = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        const demands = await CustomerDemand.find(query)
            .populate('customer')
            .populate('items.item')
            .sort({ date: -1 });

        res.status(200).json({ success: true, data: demands });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCustomerDemand = async (req, res) => {
    try {
        const demand = await CustomerDemand.findById(req.params.id)
            .populate('customer')
            .populate('items.item');

        if (!demand) return res.status(404).json({ success: false, message: 'Demand not found' });
        res.status(200).json({ success: true, data: demand });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createCustomerDemand = async (req, res) => {
    try {
        // Generate Invoice Number if not provided
        if (!req.body.invNo) {
            const count = await CustomerDemand.countDocuments();
            req.body.invNo = `DEM-${String(count + 1).padStart(5, '0')}`;
        }

        const demand = await CustomerDemand.create(req.body);
        res.status(201).json({ success: true, data: demand });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateCustomerDemand = async (req, res) => {
    try {
        const demand = await CustomerDemand.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
        if (!demand) return res.status(404).json({ success: false, message: 'Demand not found' });
        res.status(200).json({ success: true, data: demand });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteCustomerDemand = async (req, res) => {
    try {
        const demand = await CustomerDemand.findByIdAndDelete(req.params.id);
        if (!demand) return res.status(404).json({ success: false, message: 'Demand not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
