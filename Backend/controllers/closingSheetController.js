const ClosingSheet = require('../models/ClosingSheet');
const CashSale = require('../models/CashSale');
const Expense = require('../models/Expense');
const MonthlyBalance = require('../models/MonthlyBalance');

// @desc    Get closing sheet by date and branch
// @route   GET /api/v1/closing-sheets
// @access  Private
exports.getClosingSheet = async (req, res) => {
    try {
        const { date, branch } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const sheet = await ClosingSheet.findOne({
            date: { $gte: start, $lte: end },
            branch: branch || 'F-6'
        }).populate('departmentOpening.department', 'name').populate('closing01.departments.department', 'name').lean();

        if (!sheet) {
            return res.status(200).json({ success: true, data: null }); // Return null if not found
        }
        res.status(200).json({ success: true, data: sheet });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get closing sheets report by date range
// @route   GET /api/v1/closing-sheets/report
// @access  Private
exports.getClosingSheetsReport = async (req, res) => {
    try {
        const { startDate, endDate, branch } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'Start and End dates are required' });

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const query = {
            date: { $gte: start, $lte: end }
        };

        // If branch is provided and not 'all', filter by it. 
        if (branch && branch !== 'all' && branch !== 'All Branches') {
            query.branch = branch;
        }

        // Apply branch level restriction (Mir Aziz fix)
        const { applyBranchFilter } = require('../middleware/auth');
        const Employee = require('../models/Employee'); // Needed for applyBranchFilter check
        const resultQuery = await applyBranchFilter(req, query, ClosingSheet);
        
        // If query was modified by filter, it overrides the 'all' branch request
        const finalQuery = resultQuery;

        const sheets = await ClosingSheet.find(finalQuery).sort({ date: 1 }).lean();

        res.status(200).json({ success: true, data: sheets });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get department-wise report from closing02 data
// @route   GET /api/v1/closing-sheets/department-wise-report
// @access  Private
exports.getDepartmentWiseReport = async (req, res) => {
    try {
        const { startDate, endDate, branch, breakdown } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Start and End dates are required' });
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const query = {
            date: { $gte: start, $lte: end }
        };

        if (branch && branch !== 'all') {
            query.branch = branch;
        }

        // Apply branch level restriction (Mir Aziz fix)
        const { applyBranchFilter } = require('../middleware/auth');
        const finalQuery = await applyBranchFilter(req, query, ClosingSheet);

        // Fetch closing sheets
        const sheets = await ClosingSheet.find(finalQuery).lean();

        // Collect all unique department IDs from closing02 data
        const allDeptIds = new Set();
        sheets.forEach(sheet => {
            if (sheet.closing02 && sheet.closing02.data) {
                Object.keys(sheet.closing02.data).forEach(deptId => {
                    allDeptIds.add(deptId);
                    // If breakdown requested, also collect IDs from salesBreakdown
                    if (breakdown === 'true') {
                        const dData = sheet.closing02.data[deptId];
                        if (dData.salesBreakdown) {
                            Object.keys(dData.salesBreakdown).forEach(subId => allDeptIds.add(subId));
                        }
                    }
                });
            }
        });

        // Filter out non-ObjectId strings to prevent CastErrors
        const mongoose = require('mongoose');
        const validDeptIds = Array.from(allDeptIds).filter(id => mongoose.isValidObjectId(id));

        // Fetch all departments in one query
        const Department = require('../models/Department');
        const departments = await Department.find({
            _id: { $in: validDeptIds }
        }).lean();

        // Fetch all PartyCategories for Warehouse Sale mapping
        const PartyCategory = require('../models/PartyCategory');
        const partyCategories = await PartyCategory.find({}).lean();
        const catIdToName = new Map();
        partyCategories.forEach(c => catIdToName.set(c._id.toString(), c.name));

        // Create a map of department ID to name AND Name to ID (for fuzzy matching)
        const deptIdToName = new Map();
        const deptNameToId = new Map(); // Normalized Name -> ID

        const normalizeName = (name) => name ? name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

        departments.forEach(dept => {
            deptIdToName.set(dept._id.toString(), dept.name);
            deptNameToId.set(normalizeName(dept.name), dept._id.toString());
        });

        // Aggregate department-wise data from closing02
        const departmentMap = new Map();

        for (const sheet of sheets) {
            const branchName = sheet.branch;

            // Extract closing02 data
            if (sheet.closing02 && sheet.closing02.data) {
                const closing02Data = sheet.closing02.data;

                // --- BUILD COST MAP (Warehouse Sale) ---
                const costMap = new Map();
                if (closing02Data.warehouseSale && Array.isArray(closing02Data.warehouseSale)) {
                    closing02Data.warehouseSale.forEach(item => {
                        const cId = item.category;
                        const cCost = parseFloat(item.cost) || 0;
                        if (cId) {
                            const normCatName = normalizeName(catIdToName.get(cId.toString()));
                            if (normCatName) {
                                let targetDeptId = deptNameToId.get(normCatName);
                                // Fuzzy Match (Inclusion)
                                if (!targetDeptId) {
                                    for (const [dName, dId] of deptNameToId.entries()) {
                                        if (dName.length > 3 && normCatName.length > 3) {
                                            if (normCatName.includes(dName) || dName.includes(normCatName)) {
                                                targetDeptId = dId;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (targetDeptId) {
                                    const current = costMap.get(targetDeptId) || 0;
                                    costMap.set(targetDeptId, current + cCost);
                                }
                            }
                        }
                    });
                }
                // ---------------------------------------

                // Iterate through each department in closing02
                for (const [deptId, deptData] of Object.entries(closing02Data)) {
                    if (!deptData) continue; // Skip invalid entries

                    // SKIP NON-DEPARTMENT KEYS
                    // These are auxiliary fields stored in closing02 but are NOT departments.
                    if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId)) {
                        continue;
                    }

                    const parentName = deptIdToName.get(deptId) || 'UNKNOWN';

                    // Get Real Total Cost for this Department from Warehouse Sale map OR Popup Data
                    let realTotalCost = parseFloat(deptData.costSale) || parseFloat(deptData.cost) || costMap.get(deptId);

                    let itemsToProcess = [];

                    // Logic: If breakdown=true AND this department has a detailed breakdown, explode it.
                    if (breakdown === 'true' &&
                        deptData.salesBreakdown &&
                        typeof deptData.salesBreakdown === 'object' &&
                        Object.keys(deptData.salesBreakdown).length > 0) {

                        const totalSale = parseFloat(deptData.totalSaleComputer) || 0;
                        const totalDisc = parseFloat(deptData.discountValue) || 0;
                        const baseDiscountPer = parseFloat(deptData.discountPer) || 0;

                        let totalBreakdownSale = 0;
                        let totalBreakdownDisc = 0;
                        let totalBreakdownCost = 0;

                        Object.entries(deptData.salesBreakdown).forEach(([subId, subData]) => {
                            if (!subData) return; // Skip invalid sub-data

                            const subSale = parseFloat(subData.sale) || 0;
                            totalBreakdownSale += subSale;

                            // Prorate Discount Value based on sales contribution
                            let subDiscVal = 0;
                            if (totalSale !== 0) {
                                subDiscVal = (subSale / totalSale) * totalDisc;
                            }
                            totalBreakdownDisc += subDiscVal;

                            // Calculate inferred Gross for the sub-item (Net + Disc)
                            const subGross = subSale + subDiscVal;

                            // COST CALCULATION (Prioritized)
                            let subCost = 0;
                            const popupCost = parseFloat(subData.costSale) || parseFloat(subData.cost);
                            const specificCost = costMap.get(subId); // Cost matched specifically to this sub-dept ID

                            if (popupCost) {
                                // Priority 1: Direct cost from Popup (Breakdown)
                                subCost = popupCost;
                            } else if (specificCost !== undefined) {
                                // Priority 2: Specific cost from Warehouse Sale (Fuzzy Mapped to Sub-Dept)
                                subCost = specificCost;
                            } else if (realTotalCost !== undefined && totalSale !== 0) {
                                // Priority 3: Prorated Parent Cost
                                subCost = (subSale / totalSale) * realTotalCost;
                            } else {
                                // Priority 4: Fallback
                                subCost = subSale * 0.7;
                            }
                            totalBreakdownCost += subCost;

                            itemsToProcess.push({
                                id: subId,
                                parentDept: parentName,
                                sale: subSale,
                                discVal: subDiscVal,
                                discPer: baseDiscountPer, // Inherit parent discount %
                                gross: subGross,
                                cost: subCost,
                                // Breakdown items don't have these metrics tracked individually, so we leave them 0
                                counterClosing: 0, bankTotal: 0, receivedCash: 0, difference: 0, tSaleManual: 0
                            });
                        });

                        // CAPTURE REMAINDER SALES (Undefined Remainder)
                        // If the breakdown doesn't sum up to the parent total, attribute the rest to the Parent Dept itself.
                        if (totalSale > totalBreakdownSale + 1) { // +1 for float tolerance
                            const remainderSale = totalSale - totalBreakdownSale;

                            // Remainder Discount (Balance)
                            let remainderDisc = totalDisc - totalBreakdownDisc;
                            if (remainderDisc < 0) remainderDisc = 0; // Safety

                            const remainderGross = remainderSale + remainderDisc;

                            // Remainder Cost (Balance)
                            let remainderCost = 0;
                            if (realTotalCost !== undefined) {
                                remainderCost = realTotalCost - totalBreakdownCost;
                                if (remainderCost < 0) remainderCost = 0; // Safety: Cost shouldn't be negative usually
                            } else {
                                // Fallback: If we don't know the real total cost, estimate it
                                remainderCost = remainderSale * 0.7;
                            }

                            itemsToProcess.push({
                                id: deptId, // Use Parent ID
                                parentDept: parentName,
                                sale: remainderSale,
                                discVal: remainderDisc,
                                discPer: baseDiscountPer,
                                gross: remainderGross,
                                cost: remainderCost,
                                counterClosing: 0, bankTotal: 0, receivedCash: 0, difference: 0, tSaleManual: 0
                            });
                        }
                    } else {
                        // Standard Mode (or No Breakdown available)

                        // COST CALCULATION (Prioritized for Parent)
                        let myCost = 0;
                        const popupCost = parseFloat(deptData.costSale) || parseFloat(deptData.cost)
                        if (popupCost) {
                            myCost = popupCost;
                        } else if (realTotalCost !== undefined) {
                            myCost = realTotalCost;
                        } else {
                            myCost = (parseFloat(deptData.totalSaleComputer) || 0) * 0.7;
                        }

                        itemsToProcess.push({
                            id: deptId,
                            parentDept: parentName,
                            sale: parseFloat(deptData.totalSaleComputer) || 0,
                            discVal: parseFloat(deptData.discountValue) || 0,
                            discPer: parseFloat(deptData.discountPer) || 0,
                            gross: parseFloat(deptData.grossSale) || 0,
                            cost: myCost,
                            counterClosing: parseFloat(deptData.counterClosing) || 0,
                            bankTotal: parseFloat(deptData.bankTotal) || 0,
                            receivedCash: parseFloat(deptData.receivedCash) || 0,
                            difference: parseFloat(deptData.difference) || 0,
                            tSaleManual: parseFloat(deptData.tSaleManual) || 0
                        });
                    }

                    // Process items
                    for (const item of itemsToProcess) {
                        const dName = deptIdToName.get(item.id) || item.id || 'UNKNOWN';
                        const key = `${branchName}-${dName}`;

                        if (!departmentMap.has(key)) {
                            departmentMap.set(key, {
                                branch: branchName,
                                dept: dName,
                                parentDept: item.parentDept,
                                totalSaleComputer: 0,
                                grossSale: 0,
                                discountValue: 0,
                                discountPer: 0,
                                cost: 0,
                                counterClosing: 0,
                                bankTotal: 0,
                                receivedCash: 0,
                                difference: 0,
                                tSaleManual: 0,
                                count: 0
                            });
                        }

                        const aggregated = departmentMap.get(key);
                        aggregated.totalSaleComputer += item.sale;
                        aggregated.grossSale += item.gross;
                        aggregated.discountValue += item.discVal;
                        aggregated.discountPer += item.discPer;
                        aggregated.cost += item.cost;
                        aggregated.counterClosing += item.counterClosing;
                        aggregated.bankTotal += item.bankTotal;
                        aggregated.receivedCash += item.receivedCash;
                        aggregated.difference += item.difference;
                        aggregated.tSaleManual += item.tSaleManual;
                        aggregated.count += 1;
                    }
                }
            }
        }

        // Convert map to array and calculate averages
        const reportData = Array.from(departmentMap.values()).map(item => {
            const avgDiscountPer = item.count > 0 ? item.discountPer / item.count : 0;
            const dailyAverage = item.count > 0 ? item.totalSaleComputer / item.count : 0;
            return {
                ...item,
                discountPer: avgDiscountPer,
                dailyAverage: dailyAverage
            };
        });

        res.status(200).json({ success: true, data: reportData });
    } catch (err) {
        console.error('Department-Wise Report Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get Sales Report (Detailed List)
// @route   GET /api/v1/closing-sheets/sales-report
exports.getSalesReportData = async (req, res) => {
    try {
        const { startDate, endDate, branch } = req.query;
        let query = {};
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        if (branch && branch !== 'all' && branch !== 'All Branches') {
            query.branch = branch;
        }
        
        // Apply branch level restriction
        const { applyBranchFilter } = require('../middleware/auth');
        query = await applyBranchFilter(req, query, ClosingSheet);
        
        const sheets = await ClosingSheet.find(query).lean();
        res.status(200).json({ success: true, data: sheets });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get department details (daily breakdown) for popup
// @route   GET /api/v1/closing-sheets/department-details
// @access  Private
// @desc    Get department details (daily breakdown) for popup
// @route   GET /api/v1/closing-sheets/department-details
// @access  Private
exports.getDepartmentDetails = async (req, res) => {
    try {
        const { startDate, endDate, branch, dept } = req.query;
        if (!startDate || !endDate || !branch || !dept) {
            return res.status(400).json({ success: false, message: 'All parameters are required' });
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const query = {
            date: { $gte: start, $lte: end },
            branch: branch
        };

        // Fetch closing sheets
        const sheets = await ClosingSheet.find(query).sort({ date: 1 }).lean();

        // Get all department IDs
        const allDeptIds = new Set();
        sheets.forEach(sheet => {
            if (sheet.closing02 && sheet.closing02.data) {
                Object.entries(sheet.closing02.data).forEach(([deptId, deptData]) => {
                    allDeptIds.add(deptId);
                    if (deptData.salesBreakdown) {
                        Object.keys(deptData.salesBreakdown).forEach(subId => allDeptIds.add(subId));
                    }
                });
            }
        });

        const mongoose = require('mongoose');
        const Department = require('../models/Department');
        const PartyCategory = require('../models/PartyCategory');

        const validDeptIds = Array.from(allDeptIds).filter(id => mongoose.isValidObjectId(id));

        // Fetch Departments
        const departments = await Department.find({ _id: { $in: validDeptIds } }).lean();
        const deptIdToName = new Map();
        const deptNameToId = new Map();
        const normalizeName = (name) => name ? name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

        departments.forEach(d => {
            deptIdToName.set(d._id.toString(), d.name);
            deptNameToId.set(normalizeName(d.name), d._id.toString());
        });

        // Fetch Categories for Cost Mapping
        const partyCategories = await PartyCategory.find({}).lean();
        const catIdToName = new Map();
        partyCategories.forEach(c => catIdToName.set(c._id.toString(), c.name));

        // Extract daily data
        const dailyData = [];

        for (const sheet of sheets) {
            if (sheet.closing02 && sheet.closing02.data) {
                const closing02Data = sheet.closing02.data;

                // --- BUILD COST MAP for this Sheet ---
                const costMap = new Map();
                if (closing02Data.warehouseSale && Array.isArray(closing02Data.warehouseSale)) {
                    closing02Data.warehouseSale.forEach(item => {
                        const cId = item.category;
                        const cCost = parseFloat(item.cost) || 0;
                        if (cId) {
                            const normCatName = normalizeName(catIdToName.get(cId.toString()));
                            if (normCatName) {
                                let targetDeptId = deptNameToId.get(normCatName);
                                // Fuzzy Match (Inclusion)
                                if (!targetDeptId) {
                                    for (const [dName, dId] of deptNameToId.entries()) {
                                        if (dName.length > 3 && normCatName.length > 3) {
                                            if (normCatName.includes(dName) || dName.includes(normCatName)) {
                                                targetDeptId = dId;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (targetDeptId) {
                                    const current = costMap.get(targetDeptId) || 0;
                                    costMap.set(targetDeptId, current + cCost);
                                }
                            }
                        }
                    });
                }
                // -------------------------------------

                let daySale = 0;
                let dayDisc = 0;
                let dayGross = 0;
                let dayCost = 0;
                let foundForDay = false;

                for (const [deptId, deptData] of Object.entries(closing02Data)) {
                    if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId) || !deptData) continue;

                    const mainDeptName = deptIdToName.get(deptId) || deptId;
                    let realTotalCost = parseFloat(deptData.costSale) || parseFloat(deptData.cost) || costMap.get(deptId);

                    const totalParentSale = parseFloat(deptData.totalSaleComputer) || 0;
                    const totalParentDisc = parseFloat(deptData.discountValue) || 0;
                    const totalParentGross = parseFloat(deptData.grossSale) || (totalParentSale + totalParentDisc);

                    const itemsToProcess = [];

                    if (deptData.salesBreakdown && Object.keys(deptData.salesBreakdown).length > 0) {
                        let totalBreakdownSale = 0;
                        let totalBreakdownDisc = 0;
                        let totalBreakdownCost = 0;

                        for (const [subId, subData] of Object.entries(deptData.salesBreakdown)) {
                            const subDeptName = deptIdToName.get(subId) || subId;
                            const subSale = parseFloat(subData.sale) || 0;
                            const subDiscVal = totalParentSale !== 0 ? (subSale / totalParentSale) * totalParentDisc : 0;

                            let subCost = parseFloat(subData.costSale) || parseFloat(subData.cost) || costMap.get(subId);
                            if (!subCost && realTotalCost !== undefined && totalParentSale !== 0) {
                                subCost = (subSale / totalParentSale) * realTotalCost;
                            }
                            if (!subCost) subCost = subSale * 0.7;

                            totalBreakdownSale += subSale;
                            totalBreakdownDisc += subDiscVal;
                            totalBreakdownCost += subCost;

                            itemsToProcess.push({
                                name: subDeptName,
                                sale: subSale,
                                disc: subDiscVal,
                                cost: subCost,
                                gross: subSale + subDiscVal
                            });
                        }

                        // Add remainder to parent dept
                        if (totalParentSale > totalBreakdownSale + 1) {
                            const remainderSale = totalParentSale - totalBreakdownSale;
                            const remainderDisc = Math.max(0, totalParentDisc - totalBreakdownDisc);
                            let remainderCost = realTotalCost ? Math.max(0, realTotalCost - totalBreakdownCost) : (remainderSale * 0.7);

                            itemsToProcess.push({
                                name: mainDeptName,
                                sale: remainderSale,
                                disc: remainderDisc,
                                cost: remainderCost,
                                gross: remainderSale + remainderDisc
                            });
                        }
                    } else {
                        // NO BREAKDOWN
                        itemsToProcess.push({
                            name: mainDeptName,
                            sale: totalParentSale,
                            disc: totalParentDisc,
                            cost: realTotalCost || (totalParentSale * 0.7),
                            gross: totalParentGross
                        });
                    }

                    // Now check which of these items match our requested department
                    for (const item of itemsToProcess) {
                        if (item.name === dept) {
                            daySale += item.sale;
                            dayDisc += item.disc;
                            dayGross += item.gross;
                            dayCost += item.cost;
                            foundForDay = true;
                        }
                    }
                }

                if (foundForDay) {
                    const dPer = dayGross !== 0 ? (dayDisc / dayGross) * 100 : 0;
                    dailyData.push({
                        date: sheet.date,
                        discountValue: dayDisc,
                        discountPer: dPer,
                        totalSaleComputer: daySale,
                        grossSale: dayGross,
                        cost: dayCost
                    });
                }
            }
        }

        res.status(200).json({ success: true, data: dailyData });
    } catch (err) {
        console.error('Department Details Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};


// @desc    Save (Upsert) closing sheet
// @route   POST /api/v1/closing-sheets
// @access  Private
exports.saveClosingSheet = async (req, res) => {
    try {
        const { date, branch, departmentOpening, closing01 } = req.body;

        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        let sheet = await ClosingSheet.findOne({
            date: { $gte: start, $lte: end },
            branch
        });

        if (sheet) {
            // Update existing
            if (departmentOpening) sheet.departmentOpening = departmentOpening;
            if (closing01) sheet.closing01 = closing01;
            if (req.body.closing02) sheet.closing02 = req.body.closing02;
            // Add other tabs here as they implemented
            await sheet.save();
        } else {
            // Create new
            sheet = await ClosingSheet.create(req.body);
        }

        res.status(200).json({ success: true, data: sheet });
    } catch (err) {
        console.error('Save Sheet Error:', err);
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Get Income Statement Data (Monthly Sales & Expenses)
// @route   GET /api/v1/closing-sheets/income-statement
// @access  Private
exports.getIncomeStatementData = async (req, res) => {
    try {
        const { date, branch, viewType } = req.query; // viewType can be 'daily' or 'monthly'
        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        const queryDate = new Date(date);
        let start, end;

        if (viewType === 'daily') {
            // Start of Day (UTC)
            start = new Date(date);
            start.setUTCHours(0, 0, 0, 0);
            // End of Day (UTC)
            end = new Date(date);
            end.setUTCHours(23, 59, 59, 999);
        } else {
            // Default to Monthly
            start = new Date(queryDate.getFullYear(), queryDate.getMonth(), 1);
            start.setHours(0, 0, 0, 0);
            end = new Date(queryDate.getFullYear(), queryDate.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
        }

        const { applyBranchFilter } = require('../middleware/auth');
        
        // 1. Fetch Cash Sales (Total Amount for 'Cash' mode)
        let cashSaleQuery = {
            date: { $gte: start, $lte: end },
            mode: 'Cash'
        };
        if (branch && branch !== 'All Branches') cashSaleQuery.branch = branch;
        cashSaleQuery = await applyBranchFilter(req, cashSaleQuery, CashSale);

        const cashSalesResult = await CashSale.aggregate([
            { $match: cashSaleQuery },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' }
                }
            }
        ]);
        const cashSaleTotal = cashSalesResult.length > 0 ? cashSalesResult[0].total : 0;

        // 2. Fetch Bank Sales (Total Amount for NON-Cash mode)
        let bankSaleQuery = {
            date: { $gte: start, $lte: end },
            mode: { $ne: 'Cash' }
        };
        if (branch && branch !== 'All Branches') bankSaleQuery.branch = branch;
        bankSaleQuery = await applyBranchFilter(req, bankSaleQuery, CashSale);

        const bankSalesResult = await CashSale.aggregate([
            { $match: bankSaleQuery },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' }
                }
            }
        ]);
        const bankSaleTotal = bankSalesResult.length > 0 ? bankSalesResult[0].total : 0;

        // 3. Fetch Expenses (Pay) - Type: 'expense'
        let expQuery = {
            date: { $gte: start, $lte: end },
            type: 'expense'
        };
        if (branch && branch !== 'All Branches') expQuery.branch = branch;
        expQuery = await applyBranchFilter(req, expQuery, Expense);

        const payExpenses = await Expense.find(expQuery)
            .select('date createdAt description head subHead amount expenseNo notes').lean();

        // 4. Fetch Income (Received) - Type: 'receipt'
        let recQuery = {
            date: { $gte: start, $lte: end },
            type: 'receipt'
        };
        if (branch && branch !== 'All Branches') recQuery.branch = branch;
        recQuery = await applyBranchFilter(req, recQuery, Expense);

        const incomeExpenses = await Expense.find(recQuery)
            .select('date description amount').lean();

        // 5. Fetch Opening Balance from MonthlyBalance git previous month closing balance
        let openingBalance = 0;
        const currentMonthString = `${queryDate.getFullYear()}-${String(queryDate.getMonth() + 1).padStart(2, '0')}`;
        const prevDate = new Date(queryDate.getFullYear(), queryDate.getMonth() - 1, 1);
        const prevMonthString = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        const currentMonthBalance = await MonthlyBalance.findOne({ branch: branch || 'F-6', monthString: currentMonthString }).lean();

        if (currentMonthBalance) {
            openingBalance = currentMonthBalance.openingBalance;
        } else {
            // Try previous month
            const prevMonthBalance = await MonthlyBalance.findOne({ branch: branch || 'F-6', monthString: prevMonthString }).lean();
            if (prevMonthBalance) {
                openingBalance = prevMonthBalance.closingBalance;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                cashSaleTotal,
                bankSaleTotal,
                payExpenses,
                incomeExpenses,
                openingBalance // Return fetched opening balance
            }
        });

    } catch (err) {
        console.error('Income Statement Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Save Income Statement Balances
// @route   POST /api/v1/closing-sheets/income-statement
// @access  Private
exports.saveIncomeStatement = async (req, res) => {
    try {
        const { date, branch, openingBalance, closingBalance } = req.body;

        if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

        const queryDate = new Date(date);
        const monthString = `${queryDate.getFullYear()}-${String(queryDate.getMonth() + 1).padStart(2, '0')}`;

        // Define Next Month
        const nextDate = new Date(queryDate.getFullYear(), queryDate.getMonth() + 1, 1);
        const nextMonthString = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

        // Upsert Current Month
        await MonthlyBalance.findOneAndUpdate(
            { branch: branch || 'F-6', monthString: monthString },
            {
                openingBalance: openingBalance,
                closingBalance: closingBalance,
                updatedAt: Date.now()
            },
            { upsert: true, returnDocument: 'after' }
        );

        // Upsert Next Month (Set its Opening = Current Closing)
        // This ensures the chain continues
        await MonthlyBalance.findOneAndUpdate(
            { branch: branch || 'F-6', monthString: nextMonthString },
            {
                openingBalance: closingBalance,
                updatedAt: Date.now()
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.status(200).json({ success: true, message: 'Income statement saved and balances updated' });
    } catch (err) {
        console.error('Save Income Statement Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get date-wise sale report (daily breakdown by dept)
// @route   GET /api/v1/closing-sheets/date-wise-sale-report
// @access  Private
exports.getDateWiseSaleReport = async (req, res) => {
    try {
        const { startDate, endDate, branch } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Start and End dates are required' });
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const query = {
            date: { $gte: start, $lte: end }
        };

        if (branch && branch !== 'all') {
            query.branch = branch;
        }

        // Fetch closing sheets
        const sheets = await ClosingSheet.find(query).sort({ date: 1, branch: 1 }).lean();

        // Get all department IDs
        const allDeptIds = new Set();
        sheets.forEach(sheet => {
            if (sheet.closing02 && sheet.closing02.data) {
                Object.entries(sheet.closing02.data).forEach(([deptId, deptData]) => {
                    if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId)) return;
                    allDeptIds.add(deptId);
                    if (deptData && deptData.salesBreakdown) {
                        Object.keys(deptData.salesBreakdown).forEach(subId => allDeptIds.add(subId));
                    }
                });
            }
        });

        const mongoose = require('mongoose');
        const Department = require('../models/Department');
        const PartyCategory = require('../models/PartyCategory');

        const validDeptIds = Array.from(allDeptIds).filter(id => mongoose.isValidObjectId(id));

        // Fetch Departments
        const departments = await Department.find({ _id: { $in: validDeptIds } }).lean();
        const deptIdToName = new Map();
        const deptNameToId = new Map();
        const normalizeName = (name) => name ? name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

        departments.forEach(d => {
            const trimmedName = (d.name || '').trim();
            deptIdToName.set(d._id.toString(), trimmedName);
            deptNameToId.set(normalizeName(trimmedName), d._id.toString());
        });

        // Fetch Categories for Cost Mapping
        const partyCategories = await PartyCategory.find({}).lean();
        const catIdToName = new Map();
        partyCategories.forEach(c => catIdToName.set(c._id.toString(), (c.name || '').trim()));

        const reportData = [];

        for (const sheet of sheets) {
            if (sheet.closing02 && sheet.closing02.data) {
                const closing02Data = sheet.closing02.data;

                // Build cost map for this sheet
                const costMap = new Map();
                if (closing02Data.warehouseSale && Array.isArray(closing02Data.warehouseSale)) {
                    closing02Data.warehouseSale.forEach(item => {
                        const cId = item.category;
                        const cCost = parseFloat(item.cost) || 0;
                        if (cId) {
                            const catName = catIdToName.get(cId.toString());
                            if (catName) {
                                const normCatName = normalizeName(catName);
                                let targetDeptId = deptNameToId.get(normCatName);
                                if (!targetDeptId) {
                                    for (const [dName, dId] of deptNameToId.entries()) {
                                        if (dName.length > 3 && normCatName.includes(dName)) {
                                            targetDeptId = dId;
                                            break;
                                        }
                                    }
                                }
                                if (targetDeptId) {
                                    costMap.set(targetDeptId, (costMap.get(targetDeptId) || 0) + cCost);
                                }
                            }
                        }
                    });
                }

                for (const [deptId, deptData] of Object.entries(closing02Data)) {
                    if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId) || !deptData) continue;

                    let mainDeptName = (deptIdToName.get(deptId) || deptId).trim();
                    let realTotalCost = parseFloat(deptData.costSale) || parseFloat(deptData.cost) || costMap.get(deptId);

                    const totalSale = parseFloat(deptData.totalSaleComputer) || 0;
                    const totalDisc = parseFloat(deptData.discountValue) || 0;

                    if (deptData.salesBreakdown && Object.keys(deptData.salesBreakdown).length > 0) {
                        let totalBreakdownSale = 0;
                        let totalBreakdownDisc = 0;
                        let totalBreakdownCost = 0;

                        for (const [subId, subData] of Object.entries(deptData.salesBreakdown)) {
                            let subDeptName = (deptIdToName.get(subId) || subId).trim();
                            const subSale = parseFloat(subData.sale) || 0;
                            if (subSale === 0) continue;

                            let subDiscVal = totalSale !== 0 ? (subSale / totalSale) * totalDisc : 0;

                            // Cost logic for sub-dept
                            let subCost = parseFloat(subData.costSale) || parseFloat(subData.cost) || costMap.get(subId);
                            if (!subCost && realTotalCost !== undefined && totalSale !== 0) {
                                subCost = (subSale / totalSale) * realTotalCost;
                            }
                            if (!subCost) subCost = subSale * 0.7;

                            totalBreakdownSale += subSale;
                            totalBreakdownDisc += subDiscVal;
                            totalBreakdownCost += subCost;

                            reportData.push({
                                date: sheet.date,
                                branch: sheet.branch,
                                dept: subDeptName,
                                sale: subSale,
                                discount: subDiscVal,
                                cost: subCost
                            });
                        }

                        // Add remainder to parent dept if any
                        if (totalSale > totalBreakdownSale + 1) { // 1 for float tolerance
                            const remainderSale = totalSale - totalBreakdownSale;
                            const remainderDisc = Math.max(0, totalDisc - totalBreakdownDisc);
                            let remainderCost = realTotalCost ? Math.max(0, realTotalCost - totalBreakdownCost) : (remainderSale * 0.7);

                            reportData.push({
                                date: sheet.date,
                                branch: sheet.branch,
                                dept: mainDeptName,
                                sale: remainderSale,
                                discount: remainderDisc,
                                cost: remainderCost
                            });
                        }
                    } else if (totalSale !== 0 || totalDisc !== 0) {
                        // NO BREAKDOWN - Add Parent as is
                        reportData.push({
                            date: sheet.date,
                            branch: sheet.branch,
                            dept: mainDeptName,
                            sale: totalSale,
                            discount: totalDisc,
                            cost: realTotalCost || (totalSale * 0.7)
                        });
                    }
                }
            }
        }

        res.status(200).json({ success: true, data: reportData });
    } catch (err) {
        console.error('Date-Wise Sale Report Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
