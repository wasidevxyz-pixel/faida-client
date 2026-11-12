const WHItemCompany = require('../models/WHItemCompany');

// @desc    Get all companies
// @route   GET /api/v1/wh-item-companies
exports.getCompanies = async (req, res) => {
    try {
        const companies = await WHItemCompany.find().sort({ name: 1 });
        res.status(200).json({ success: true, count: companies.length, data: companies });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create company
// @route   POST /api/v1/wh-item-companies
exports.createCompany = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const company = await WHItemCompany.create(req.body);
        res.status(201).json({ success: true, data: company });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update company
// @route   PUT /api/v1/wh-item-companies/:id
exports.updateCompany = async (req, res) => {
    try {
        const company = await WHItemCompany.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        res.status(200).json({ success: true, data: company });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete company
// @route   DELETE /api/v1/wh-item-companies/:id
exports.deleteCompany = async (req, res) => {
    try {
        const company = await WHItemCompany.findByIdAndDelete(req.params.id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        res.status(200).json({ success: true, message: 'Company deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
