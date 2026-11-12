const EmployeeAdjustment = require('../models/EmployeeAdjustment');
const { recalculateAdvanceBalances } = require('./employeeAdvanceController');

// @desc    Get adjustments
// @route   GET /api/v1/employee-adjustments
exports.getAdjustments = async (req, res) => {
    try {
        const { employee, branch, date, from, to } = req.query;
        let query = {};
        if (!employee) {
            const hiddenEmps = await require('../models/Employee').find({
                $or: [{ payrollImportOnly: true }, { code: /^IMP-/i }]
            }).select('_id').lean();
            if (hiddenEmps.length > 0) {
                query.employee = { $nin: hiddenEmps.map(e => e._id) };
            }
        }
        if (employee) query.employee = employee;
        if (branch) query.branch = branch;

        if (from && to) {
            query.date = {
                $gte: new Date(from),
                $lte: new Date(new Date(to).setHours(23, 59, 59, 999))
            };
        } else if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            query.date = { $gte: startDate, $lt: endDate };
        }

        const adjustments = await EmployeeAdjustment.find(query)
            .select('employee date branch type amount remarks createdAt')
            .populate('employee', 'name code')
            .sort({ date: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: adjustments.length,
            data: adjustments
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


const { recalculateEmployeeLedger } = require('./employeeLedgerController');

// @desc    Create adjustment
// @route   POST /api/v1/employee-adjustments
exports.createAdjustment = async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const adjustment = await EmployeeAdjustment.create(req.body);
        console.log('Adjustment Created:', adjustment._id, adjustment.type, adjustment.amount);

        // 1. Mirror to Employee Advance (So it appears in Advance Screen & Payroll)
        // 'Pay' in Adjustment = Giving money to employee = Advance 'Pay'
        // 'Received' in Adjustment = Getting money back = Advance 'Received'
        if (adjustment.employee) {
            console.log('Attempting to create Advance Mirror...');
            const EmployeeAdvance = require('../models/EmployeeAdvance');
            try {
                const adv = await EmployeeAdvance.create({
                    employee: adjustment.employee,
                    date: adjustment.date,
                    branch: adjustment.branch,
                    transactionType: adjustment.type, // 'Pay' or 'Received' matches perfectly
                    paid: adjustment.amount,
                    remarks: `Adjustment: ${adjustment.remarks || ''}`,
                    createdBy: req.user._id,
                    // We don't link payroll here as it's a manual adjustment
                });
                console.log('Advance Mirror Created:', adv._id);
            } catch (err) {
                console.error('Mirroring Failed:', err);
            }
        }

        // 2. Sync Ledger
        if (adjustment.employee) {
            await recalculateEmployeeLedger(adjustment.employee);
            await recalculateAdvanceBalances(adjustment.employee);
        }

        res.status(201).json({ success: true, data: adjustment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete adjustment
// @route   DELETE /api/v1/employee-adjustments/:id
exports.deleteAdjustment = async (req, res) => {
    try {
        const adjustment = await EmployeeAdjustment.findByIdAndDelete(req.params.id);
        if (!adjustment) {
            return res.status(404).json({ success: false, message: 'Adjustment not found' });
        }

        // 1. AUTO-DELETE MIRRORED ADVANCE
        // We must remove the corresponding "financial effect" from the Advance module
        const EmployeeAdvance = require('../models/EmployeeAdvance');
        await EmployeeAdvance.findOneAndDelete({
            employee: adjustment.employee,
            paid: adjustment.amount,
            transactionType: adjustment.type,
            remarks: { $regex: 'Adjustment', $options: 'i' }, // Ensure we only delete ones we created
            date: adjustment.date // Match the date exactly as it was mirrored
        });

        // 2. Sync Ledger
        if (adjustment.employee) {
            await recalculateEmployeeLedger(adjustment.employee);
            await recalculateAdvanceBalances(adjustment.employee);
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
