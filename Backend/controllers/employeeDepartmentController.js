const EmployeeDepartment = require('../models/EmployeeDepartment');

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// @desc    Get all employee departments
// @route   GET /api/v1/employee-departments
exports.getEmployeeDepartments = async (req, res) => {
    try {
        const branch = req.query.branch ? String(req.query.branch).trim() : '';
        const normalizedBranch = branch && !['all', 'select branch', 'null', 'undefined', ''].includes(branch.toLowerCase())
            ? branch
            : '';

        const query = {};
        if (normalizedBranch) {
            // Strip surrounding parentheses before escaping, then build a flexible regex
            const stripped = normalizedBranch.replace(/^\(|\)$/g, '');
            const branchPattern = escapeRegExp(stripped);
            query.branch = {
                $regex: `^\\s*\\(?${branchPattern}\\)?\\s*$`,
                $options: 'i'
            };
        }

        const departments = await EmployeeDepartment.find(query).sort({ name: 1 }).lean();
        res.status(200).json({ success: true, data: departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single employee department
// @route   GET /api/v1/employee-departments/:id
exports.getEmployeeDepartment = async (req, res) => {
    try {
        const department = await EmployeeDepartment.findById(req.params.id).lean();
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        res.status(200).json({ success: true, data: department });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create employee department
// @route   POST /api/v1/employee-departments
exports.createEmployeeDepartment = async (req, res) => {
    try {
        const department = await EmployeeDepartment.create(req.body);
        res.status(201).json({ success: true, data: department });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update employee department
// @route   PUT /api/v1/employee-departments/:id
exports.updateEmployeeDepartment = async (req, res) => {
    try {
        const department = await EmployeeDepartment.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        res.status(200).json({ success: true, data: department });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete employee department
// @route   DELETE /api/v1/employee-departments/:id
exports.deleteEmployeeDepartment = async (req, res) => {
    try {
        const department = await EmployeeDepartment.findByIdAndDelete(req.params.id);
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
