const Department = require('../models/Department');

// @desc    Get all departments
// @route   GET /api/v1/departments
// @access  Private
exports.getDepartments = async (req, res) => {
    try {
        const departments = await Department.find()
            .populate('parentDepartment', 'name branch')
            .sort({ name: 1 })
            .lean();
        res.status(200).json({ success: true, count: departments.length, data: departments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get single department
// @route   GET /api/v1/departments/:id
// @access  Private
exports.getDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id).lean();
        if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
        res.status(200).json({ success: true, data: department });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Create department
// @route   POST /api/v1/departments
// @access  Private/Admin/Manager
exports.createDepartment = async (req, res) => {
    try {
        const department = await Department.create(req.body);
        res.status(201).json({ success: true, data: department });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update department
// @route   PUT /api/v1/departments/:id
// @access  Private/Admin/Manager
exports.updateDepartment = async (req, res) => {
    try {
        const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });
        if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
        res.status(200).json({ success: true, data: department });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete department
// @route   DELETE /api/v1/departments/:id
// @access  Private/Admin
exports.deleteDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
        await department.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
