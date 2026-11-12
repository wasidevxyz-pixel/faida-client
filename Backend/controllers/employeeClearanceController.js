const EmployeeClearance = require('../models/EmployeeClearance');
const Payroll = require('../models/Payroll');

// @desc    Get clearances
// @route   GET /api/v1/employee-clearances
exports.getClearances = async (req, res) => {
    try {
        const { employee, branch, from, to } = req.query;
        let query = {};
        if (employee) query.employee = employee;
        if (branch) query.branch = branch;
        if (from && to) {
            query.date = { $gte: new Date(from), $lte: new Date(new Date(to).setHours(23, 59, 59, 999)) };
        }

        const clearances = await EmployeeClearance.find(query)
            .select('employee date branch remarks createdAt')
            .populate('employee', 'name code')
            .sort({ date: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: clearances.length,
            data: clearances
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Create clearance
// @route   POST /api/v1/employee-clearances
exports.createClearance = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const clearance = await EmployeeClearance.create(req.body);
        res.status(201).json({ success: true, data: clearance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete clearance
// @route   DELETE /api/v1/employee-clearances/:id
exports.deleteClearance = async (req, res) => {
    try {
        const clearance = await EmployeeClearance.findByIdAndDelete(req.params.id);
        if (!clearance) {
            return res.status(404).json({ success: false, message: 'Clearance not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
