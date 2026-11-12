const WHCustomerType = require('../models/WHCustomerType');

exports.getCustomerTypes = async (req, res) => {
    try {
        const types = await WHCustomerType.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: types.length, data: types });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createCustomerType = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const type = await WHCustomerType.create(req.body);
        res.status(201).json({ success: true, data: type });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
