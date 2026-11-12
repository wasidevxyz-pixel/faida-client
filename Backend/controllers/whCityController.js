const WHCity = require('../models/WHCity');

exports.getCities = async (req, res) => {
    try {
        const cities = await WHCity.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: cities.length, data: cities });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createCity = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const city = await WHCity.create(req.body);
        res.status(201).json({ success: true, data: city });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
