const mongoose = require('mongoose');
const Company = require('../models/Company');

// @desc    Get all companies
// @route   GET /api/v1/companies
// @access  Private
exports.getCompanies = async (req, res) => {
    try {
        const companies = await Company.find({ isActive: true }).sort('name');

        res.status(200).json({
            success: true,
            count: companies.length,
            data: companies
        });
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching companies'
        });
    }
};

// @desc    Get single company
// @route   GET /api/v1/companies/:id
// @access  Private
exports.getCompany = async (req, res) => {
    try {
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: `Resource not found with id of ${req.params.id}`
            });
        }

        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        res.status(200).json({
            success: true,
            data: company
        });
    } catch (error) {
        console.error('Error fetching company:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching company'
        });
    }
};

// @desc    Create new company
// @route   POST /api/v1/companies
// @access  Private
exports.createCompany = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        const company = await Company.create(req.body);

        res.status(201).json({
            success: true,
            data: company
        });
    } catch (error) {
        console.error('Error creating company:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Company with this name already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: error.message || 'Failed to create company'
        });
    }
};

// @desc    Update company
// @route   PUT /api/v1/companies/:id
// @access  Private
exports.updateCompany = async (req, res) => {
    try {
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: `Resource not found with id of ${req.params.id}`
            });
        }

        const company = await Company.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        res.status(200).json({
            success: true,
            data: company
        });
    } catch (error) {
        console.error('Error updating company:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to update company'
        });
    }
};

// @desc    Delete company
// @route   DELETE /api/v1/companies/:id
// @access  Private
exports.deleteCompany = async (req, res) => {
    try {
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: `Resource not found with id of ${req.params.id}`
            });
        }

        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        company.isActive = false;
        await company.save();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Error deleting company:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting company'
        });
    }
};
