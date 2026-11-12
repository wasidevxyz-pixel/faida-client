const EmployeeCommission = require('../models/EmployeeCommission');
const asyncHandler = require('../middleware/async');

// @desc    Get commission data by filters
// @route   GET /api/v1/employee-commissions
exports.getCommissions = asyncHandler(async (req, res, next) => {
    const { monthYear, branch, department, subBranch, type, whCategory, commissionCategory, commissionBranch } = req.query;

    const finalDept = (type === 'dep_item_wise') ? '' : (department || '');
    const catName = whCategory || commissionCategory || '';

    let query = {
        monthYear,
        branch,
        type,
        department: finalDept,
        subBranch: subBranch || ''
    };

    if (type === 'distribute') {
        // For distribute, query uniquely by monthYear + branch + type so it always finds the branch sheet
        const docs = await EmployeeCommission.find({ monthYear, branch, type: 'distribute' }).sort({ createdAt: 1 }).lean();
        let primaryDoc = { data: [] };

        if (docs.length > 1) {
            // Consolidate legacy duplicates across departments into one unified document
            primaryDoc = docs[0];
            const mergedMap = new Map();
            docs.forEach(doc => {
                (doc.data || []).forEach(row => {
                    const rowId = (row.id || '').toString();
                    if (!rowId) return;
                    const existing = mergedMap.get(rowId);
                    if (!existing) {
                        mergedMap.set(rowId, { ...row });
                    } else {
                        // Merge non-zero commission values
                        if ((row.otherCommission || 0) > (existing.otherCommission || 0)) existing.otherCommission = row.otherCommission;
                        if ((row.ugCommission || 0) > (existing.ugCommission || 0)) existing.ugCommission = row.ugCommission;
                        if ((row.warehouseCommission || 0) > (existing.warehouseCommission || 0)) existing.warehouseCommission = row.warehouseCommission;
                        existing.total = (parseFloat(existing.otherCommission) || 0) + (parseFloat(existing.ugCommission) || 0) + (parseFloat(existing.warehouseCommission) || 0);
                    }
                });
            });
            primaryDoc.data = Array.from(mergedMap.values());
        } else if (docs.length === 1) {
            primaryDoc = docs[0];
        }

        // Attach current registered branch for each employee in primaryDoc.data to identify transferred staff
        const employeeIds = (primaryDoc.data || []).map(r => r.id).filter(Boolean);
        if (employeeIds.length > 0) {
            const Employee = require('../models/Employee');
            const emps = await Employee.find({ _id: { $in: employeeIds } }, 'branch').lean();
            const branchMap = new Map();
            emps.forEach(e => {
                const bName = (e.branch || '').toString().trim();
                branchMap.set(e._id.toString(), bName);
            });

            primaryDoc.data = (primaryDoc.data || []).map(r => {
                const currentBranch = branchMap.get((r.id || '').toString());
                return {
                    ...r,
                    currentBranch: currentBranch || branch
                };
            });
        }

        // Also fetch any saved distribute commissions in other branches for this month to support automatic transfer
        const otherBranchDocs = await EmployeeCommission.find({
            monthYear,
            branch: { $ne: branch },
            type: 'distribute'
        }).lean();

        const transferredCommissions = [];
        otherBranchDocs.forEach(ob => {
            (ob.data || []).forEach(row => {
                if ((parseFloat(row.total) || 0) > 0) {
                    transferredCommissions.push({
                        ...row,
                        fromBranch: ob.branch
                    });
                }
            });
        });

        return res.status(200).json({
            success: true,
            data: primaryDoc,
            transferredCommissions
        });
    }

    if (commissionBranch) {
        query.commissionBranch = commissionBranch;
    }

    if (type === 'dep_item_wise') {
        query.whCategory = whCategory || '';
        query.commissionCategory = commissionCategory || '';
    }

    const commission = await EmployeeCommission.findOne(query);

    res.status(200).json({
        success: true,
        data: commission || { data: [] } // Return empty structure if not found
    });
});

// @desc    Get all commissions list (summary)
// @route   GET /api/v1/employee-commissions/list
exports.getCommissionsList = asyncHandler(async (req, res, next) => {
    // Fetch all, populate commissionBranch for accurate display and filtering
    const commissions = await EmployeeCommission.find()
        .populate('commissionBranch', 'name branchTarget targetCommission active')
        .sort({ monthYear: -1, createdAt: -1 });

    res.status(200).json({
        success: true,
        count: commissions.length,
        data: commissions
    });
});

// @desc    Save (Upsert) Commission Data
// @route   POST /api/v1/employee-commissions
exports.createCommission = asyncHandler(async (req, res, next) => {
    req.body.createdBy = req.user._id;
    const { monthYear, branch, department, subBranch, type, data, fromDate, toDate, whCategory, commissionCategory, commissionBranch, remarks } = req.body;

    // Validation based on type
    if (!type) return res.status(400).json({ success: false, message: 'Type is missing' });
    if (!branch) return res.status(400).json({ success: false, message: 'Branch is missing' });
    if (!monthYear) return res.status(400).json({ success: false, message: 'Month-Year is missing' });

    const finalDept = (type === 'dep_item_wise') ? '' : (department || '');
    const finalSubBranch = (type === 'dep_item_wise') ? '' : (subBranch || '');
    const catName = whCategory || commissionCategory || '';

    async function pullTransferredEmployeesFromOtherBranches(currentBranch, savedData) {
        if (type !== 'distribute') return;
        const savedEmployeeIds = (savedData || []).map(d => (d.id || '').toString()).filter(Boolean);
        if (savedEmployeeIds.length === 0) return;

        const mongoose = require('mongoose');
        const objectIds = savedEmployeeIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
        const allIds = [...savedEmployeeIds, ...objectIds];

        const strippedBranch = currentBranch.toString().trim().replace(/^\(|\)$/g, '');
        const branchRegex = new RegExp(`^\\s*\\(?${strippedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?\\s*$`, 'i');

        await EmployeeCommission.updateMany(
            {
                monthYear,
                branch: { $not: branchRegex },
                type: 'distribute',
                'data.id': { $in: allIds }
            },
            {
                $pull: { data: { id: { $in: allIds } } }
            }
        );
    }

    // Safety check for ID replacement:
    // If an ID is provided, verify whether it genuinely belongs to the SAME sheet (type, monthYear, and commissionBranch)
    let updateId = req.body.id || req.body._id;
    if (updateId) {
        const existingDoc = await EmployeeCommission.findById(updateId);
        if (existingDoc) {
            const isSameType = existingDoc.type === type;
            const isSameMonth = existingDoc.monthYear === monthYear;
            const isSameCommBranch = !commissionBranch || (existingDoc.commissionBranch && existingDoc.commissionBranch.toString() === commissionBranch.toString());
            const isSameBranch = existingDoc.branch === branch;

            // Only update this specific ID if it genuinely belongs to the same target sheet
            if (isSameType && isSameMonth && isSameCommBranch && (type === 'sale_commission' || isSameBranch)) {
                const updated = await EmployeeCommission.findByIdAndUpdate(updateId, {
                    ...req.body,
                    department: finalDept,
                    subBranch: finalSubBranch,
                    remarks: remarks || ''
                }, { returnDocument: 'after', runValidators: true });

                if (type === 'distribute') {
                    // Clean up duplicate sheets and pull saved employees out of other branches
                    await EmployeeCommission.deleteMany({
                        _id: { $ne: updateId },
                        monthYear,
                        branch,
                        type: 'distribute'
                    });
                    await pullTransferredEmployeesFromOtherBranches(branch, req.body.data);
                }

                return res.status(200).json({ success: true, data: updated });
            }
        }
        // If ID does NOT match the current branch/month (e.g. state.editingId leaked from another branch),
        // DO NOT overwrite the old branch's document! Treat as a fresh save/upsert for the new branch.
        updateId = null;
    }

    // Determine duplicate / existing record filter
    let existingFilter;
    if (type === 'sale_commission' && commissionBranch) {
        // For sale_commission, the target is uniquely identified by month + commissionBranch
        existingFilter = {
            monthYear,
            commissionBranch,
            type
        };
    } else if (type === 'distribute') {
        // For distribute, there is only ONE sheet per branch per month to prevent double commissions!
        existingFilter = {
            monthYear,
            branch,
            type
        };
    } else {
        existingFilter = {
            monthYear,
            branch,
            type,
            department: finalDept,
            subBranch: finalSubBranch
        };
        if (commissionBranch) {
            existingFilter.commissionBranch = commissionBranch;
        }
        if (type === 'dep_item_wise') {
            existingFilter.whCategory = whCategory || '';
            existingFilter.commissionCategory = commissionCategory || '';
        }
    }

    const existing = await EmployeeCommission.findOne(existingFilter);

    if (existing) {
        // If a record already exists for this exact commission branch & month, safely update IT instead of failing or duplicating
        const updated = await EmployeeCommission.findByIdAndUpdate(existing._id, {
            ...req.body,
            department: finalDept,
            subBranch: finalSubBranch,
            remarks: remarks || ''
        }, { returnDocument: 'after', runValidators: true });

        if (type === 'distribute') {
            // Clean up any remaining legacy duplicate docs for this branch & month so payroll only sees 1 sheet
            await EmployeeCommission.deleteMany({
                _id: { $ne: existing._id },
                monthYear,
                branch,
                type: 'distribute'
            });

            // Automatically pull these saved employees out of any OTHER branch's distribute sheet for this month
            await pullTransferredEmployeesFromOtherBranches(branch, req.body.data);
        }

        return res.status(200).json({ success: true, data: updated });
    }

    // Create new record
    const commission = await EmployeeCommission.create({
        ...req.body,
        department: finalDept,
        subBranch: finalSubBranch,
        remarks: remarks || ''
    });

    if (type === 'distribute') {
        // Automatically pull these saved employees out of any OTHER branch's distribute sheet for this month
        await pullTransferredEmployeesFromOtherBranches(branch, req.body.data);
    }

    res.status(201).json({
        success: true,
        data: commission
    });
});

// @desc    Get commission record by ID
// @route   GET /api/v1/employee-commissions/detail/:id
exports.getCommissionById = asyncHandler(async (req, res, next) => {
    const commission = await EmployeeCommission.findById(req.params.id);
    if (!commission) {
        return res.status(404).json({ success: false, message: 'Commission record not found' });
    }
    res.status(200).json({ success: true, data: commission });
});

// @desc    Delete commission sheet
// @route   DELETE /api/v1/employee-commissions/:id
exports.deleteCommission = asyncHandler(async (req, res, next) => {
    const commission = await EmployeeCommission.findByIdAndDelete(req.params.id);

    if (!commission) {
        return res.status(404).json({ success: false, message: 'Commission not found' });
    }

    res.status(200).json({ success: true, data: {} });
});
