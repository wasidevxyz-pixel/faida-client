const EmployeePenalty = require('../models/EmployeePenalty');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');

// @desc    Get all penalties
// @route   GET /api/v1/employee-penalties
exports.getPenalties = async (req, res) => {
    try {
        const { date, employee, branch } = req.query;
        let query = {};
        if (!employee) {
            const hiddenEmps = await Employee.find({
                $or: [{ payrollImportOnly: true }, { code: /^IMP-/i }]
            }).select('_id').lean();
            if (hiddenEmps.length > 0) {
                query.employee = { $nin: hiddenEmps.map(e => e._id) };
            }
        }

        let targetMonthYear = null;
        if (date) {
            const d = new Date(date);
            const startDate = new Date(d.getFullYear(), d.getMonth(), 1);
            const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
            query.date = { $gte: startDate, $lte: endDate };
            targetMonthYear = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        }
        if (employee) query.employee = employee;
        if (branch) query.branch = branch;

        const penalties = await EmployeePenalty.find(query)
            .select('employee date branch department designation penaltyAmount createdBy createdAt')
            .populate('employee', 'name code department designation')
            .sort({ date: -1 })
            .lean();

        // ─── PHASE 3: Fix N+1 Query ────────────────────────────────
        // Batch lookup: instead of one Payroll.findOne() per penalty (N queries),
        // fetch all relevant payrolls in ONE query, then check in memory.
        let postedEmployeeIds = new Set();
        if (targetMonthYear && penalties.length > 0) {
            const empIds = [...new Set(penalties.map(p => p.employee?._id?.toString()).filter(Boolean))];
            const postedPayrolls = await Payroll.find({
                employee: { $in: empIds },
                monthYear: targetMonthYear
            }).select('employee').lean();
            postedEmployeeIds = new Set(postedPayrolls.map(p => p.employee.toString()));
        }

        const penaltiesWithStatus = penalties.map(p => ({
            ...p,
            isPosted: postedEmployeeIds.has(p.employee?._id?.toString())
        }));

        res.status(200).json({
            success: true,
            count: penaltiesWithStatus.length,
            data: penaltiesWithStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Create penalty
// @route   POST /api/v1/employee-penalties
exports.createPenalty = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;

        const penalty = await EmployeePenalty.create(req.body);

        // Optionally update Employee record if needed (e.g. cumulative penalties)

        res.status(201).json({
            success: true,
            data: penalty
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update penalty
// @route   PUT /api/v1/employee-penalties/:id
exports.updatePenalty = async (req, res) => {
    try {
        const penalty = await EmployeePenalty.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        if (!penalty) {
            return res.status(404).json({ success: false, message: 'Penalty not found' });
        }

        res.status(200).json({ success: true, data: penalty });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete penalty
// @route   DELETE /api/v1/employee-penalties/:id
exports.deletePenalty = async (req, res) => {
    try {
        const penalty = await EmployeePenalty.findByIdAndDelete(req.params.id);

        if (!penalty) {
            return res.status(404).json({ success: false, message: 'Penalty not found' });
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
