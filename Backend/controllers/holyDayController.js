const HolyDay = require('../models/HolyDay');

// @desc    Get all holy days
// @route   GET /api/v1/holy-days
exports.getHolyDays = async (req, res) => {
    try {
        const holyDays = await HolyDay.find().sort({ date: 1 });

        res.status(200).json({
            success: true,
            count: holyDays.length,
            data: holyDays
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create holy day
// @route   POST /api/v1/holy-days
exports.createHolyDay = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;

        const holyDay = await HolyDay.create(req.body);

        res.status(201).json({
            success: true,
            data: holyDay
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update holy day
// @route   PUT /api/v1/holy-days/:id
exports.updateHolyDay = async (req, res) => {
    try {
        const holyDay = await HolyDay.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        if (!holyDay) {
            return res.status(404).json({ success: false, message: 'Holy day not found' });
        }

        res.status(200).json({ success: true, data: holyDay });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete holy day
// @route   DELETE /api/v1/holy-days/:id
exports.deleteHolyDay = async (req, res) => {
    try {
        const holyDay = await HolyDay.findByIdAndDelete(req.params.id);

        if (!holyDay) {
            return res.status(404).json({ success: false, message: 'Holy day not found' });
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
