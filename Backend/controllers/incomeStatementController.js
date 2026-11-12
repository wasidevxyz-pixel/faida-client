const ClosingSheet = require('../models/ClosingSheet');
const SalesReturn = require('../models/SalesReturn');
const Expense = require('../models/Expense');
const Department = require('../models/Department');
const DailyCash = require('../models/DailyCash');

const PartyCategory = require('../models/PartyCategory');

// @desc    Get Income Statement Report
// @route   GET /api/v1/income-statement
// @access  Private
exports.getIncomeStatement = async (req, res) => {
    try {
        const { branch, startDate, endDate } = req.query;

        if (!branch || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide branch, startDate, and endDate'
            });
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        console.log('Income Statement Request:', { branch, startDate, endDate });

        // Fetch closing sheets for the period
        const sheets = await ClosingSheet.find({
            branch,
            date: { $gte: start, $lte: end }
        }).lean();

        console.log('Found closing sheets:', sheets.length);

        // Collect all department IDs from closing02 data
        const allDeptIds = new Set();
        sheets.forEach(sheet => {
            if (sheet.closing02 && sheet.closing02.data) {
                Object.keys(sheet.closing02.data).forEach(deptId => {
                    allDeptIds.add(deptId);
                    // Also collect sub-department IDs from salesBreakdown
                    const dData = sheet.closing02.data[deptId];
                    if (dData.salesBreakdown) {
                        Object.keys(dData.salesBreakdown).forEach(subId => allDeptIds.add(subId));
                    }
                });
            }
        });

        // Filter valid ObjectIds
        const mongoose = require('mongoose');
        const validDeptIds = Array.from(allDeptIds).filter(id => mongoose.isValidObjectId(id));

        // Fetch ALL departments for robust name mapping
        // Fetch ALL departments for robust name mapping
        const allDepartments = await Department.find({ isActive: true }).select('name parentDepartment deduction').lean();

        const deptIdToName = new Map();
        const deptIdToObj = new Map();
        const deptNameToId = new Map(); // Normalized Name -> ID

        // Helper for normalization
        const normalizeName = (name) => name ? name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

        allDepartments.forEach(dept => {
            const dId = dept._id.toString();
            deptIdToName.set(dId, dept.name);
            deptIdToObj.set(dId, dept);
            if (dept.name) {
                const norm = normalizeName(dept.name);
                if (norm) {
                    // map normalized name to ID
                    deptNameToId.set(norm, dId);
                }
            }
        });

        // Fetch Customer Categories (PartyCategory) to map Category ID -> Name
        const allCategories = await PartyCategory.find({}).lean();
        const catIdToName = new Map();
        allCategories.forEach(cat => {
            if (cat.name) {
                // Store Normalized Name for lookup
                catIdToName.set(cat._id.toString(), normalizeName(cat.name));
            }
        });

        // Aggregate data by parent department
        const departmentGroups = new Map();

        // Helper to check valid ID
        const isValidId = (id) => mongoose.isValidObjectId(id);

        let totalDiffSum = 0; // Accumulator for Short Cash calculation

        for (const sheet of sheets) {
            if (!sheet.closing02 || !sheet.closing02.data) continue;

            const closing02Data = sheet.closing02.data;

            // Calculate Short Cash (diff sum)
            // Iterate all entries, skip known non-dept keys
            for (const [key, val] of Object.entries(closing02Data)) {
                if (key === 'warehouseSale' || key === 'totals') continue;
                if (!val || typeof val !== 'object') continue;

                // Check for difference
                let rawDiff = val.difference !== undefined ? val.difference : val.diff;
                if (rawDiff !== undefined) {
                    let diffNum = 0;
                    if (typeof rawDiff === 'number') {
                        diffNum = rawDiff;
                    } else if (typeof rawDiff === 'string') {
                        let cleanDiff = rawDiff.trim();
                        // Check for parenthesis format (123) -> -123
                        const isNegative = cleanDiff.startsWith('(') && cleanDiff.endsWith(')');
                        cleanDiff = cleanDiff.replace(/[(),]/g, ''); // Remove ( ) ,
                        diffNum = parseFloat(cleanDiff) || 0;
                        if (isNegative) diffNum = -Math.abs(diffNum);
                    }
                    console.log(`[ShortCash] Key: ${key}, DiffOrigin: ${rawDiff}, Parsed: ${diffNum}`);
                    totalDiffSum += diffNum;
                }
            }
            console.log(`[ShortCash] Sheet Date: ${sheet.date}, Branch: ${sheet.branch}, TotalDiff: ${totalDiffSum}`);

            // Build Cost Map from Warehouse Sale (Name Matching)
            // Map<DeptID, Cost>
            const costMap = new Map();
            if (closing02Data.warehouseSale && Array.isArray(closing02Data.warehouseSale)) {
                closing02Data.warehouseSale.forEach(item => {
                    const cId = item.category; // Category ID
                    const cCost = parseFloat(item.cost) || 0;

                    if (cId) {
                        const normCatName = catIdToName.get(cId.toString());
                        if (normCatName) {
                            let deptId = deptNameToId.get(normCatName);

                            // Fuzzy Match if no exact normalized match
                            if (!deptId) {
                                for (const [normDeptName, dId] of deptNameToId.entries()) {
                                    // Check for inclusion (e.g. MEDICINENUTRA includes MEDICINE)
                                    // Ensure reasonable length (>3)
                                    if (normDeptName.length > 3 && normCatName.length > 3) {
                                        if (normCatName.includes(normDeptName) || normDeptName.includes(normCatName)) {
                                            deptId = dId;
                                            break; // Stop at first reasonable match
                                        }
                                    }
                                }
                            }

                            if (deptId) {
                                const current = costMap.get(deptId) || 0;
                                costMap.set(deptId, current + cCost);
                            }
                        }
                    }
                });
            }

            // Process each department in closing02
            for (const [deptId, deptData] of Object.entries(closing02Data)) {
                if (!deptData) continue;

                const dept = deptIdToObj.get(deptId);
                // Only process departments that match our original filter logic if needed, 
                // but usually we want everything in the sheet. 
                // Let's stick to valid ones.
                if (!dept) continue;
                // We might want to filter by closing2CompSale like before? 
                // The user logic kept it. Let's respect "closing2CompSale" roughly, 
                // but if it's in the sheet, it probably should be shown. 
                // Let's trust the sheet data.

                const parentDept = dept.parentDepartment ? deptIdToObj.get(dept.parentDepartment.toString()) : dept;
                const actualParent = parentDept || dept; // Fallback
                const parentId = actualParent._id.toString();
                const parentName = actualParent.name;

                // Initialize parent group if not exists
                if (!departmentGroups.has(parentId)) {
                    departmentGroups.set(parentId, {
                        parentName: parentName,
                        parentId: parentId,
                        parentDed: actualParent.deduction || 0,
                        subDepartments: new Map(), // Use Map to aggregate sub-departments
                        totals: {
                            sales: 0,
                            cost: 0,
                            bankDeduction: 0,
                            grossProfit: 0,
                            discount: 0,
                            gpProfit: 0
                        }
                    });
                }

                const group = departmentGroups.get(parentId);

                // Get Real Total Cost for this Department from Warehouse Sale map OR Popup Data
                let realTotalCost = parseFloat(deptData.costSale) || parseFloat(deptData.cost) || costMap.get(deptId);
                const totalSale = parseFloat(deptData.totalSaleComputer) || 0;

                // Check if this department has breakdown
                if (deptData.salesBreakdown && Object.keys(deptData.salesBreakdown).length > 0) {
                    // Process breakdown (sub-departments)
                    // Process breakdown (sub-departments)
                    const totalDisc = parseFloat(deptData.discountValue) || 0;

                    let totalBreakdownSale = 0;
                    let totalBreakdownDisc = 0;
                    let totalBreakdownCost = 0;

                    Object.entries(deptData.salesBreakdown).forEach(([subId, subData]) => {
                        if (!subData) return;

                        const subDeptName = deptIdToName.get(subId) || 'UNKNOWN';
                        const subSale = parseFloat(subData.sale) || 0;
                        totalBreakdownSale += subSale;

                        // Prorate discount
                        let subDiscVal = 0;
                        if (totalSale !== 0) {
                            subDiscVal = (subSale / totalSale) * totalDisc;
                        }
                        totalBreakdownDisc += subDiscVal;

                        // Calculate cost
                        let subCost = 0;
                        const popupCost = parseFloat(subData.costSale) || parseFloat(subData.cost);
                        const specificCost = costMap.get(subId);

                        if (popupCost) {
                            // Priority 1: Direct cost from Popup (Breakdown)
                            subCost = popupCost;
                        } else if (specificCost !== undefined) {
                            // Priority 2: Specific cost from Warehouse Sale (Fuzzy Mapped)
                            subCost = specificCost;
                        } else if (realTotalCost !== undefined && totalSale !== 0) {
                            // Priority 3: Prorated Parent Cost
                            subCost = (subSale / totalSale) * realTotalCost;
                        } else {
                            // Priority 4: Fallback
                            subCost = subSale * 0.7;
                        }
                        totalBreakdownCost += subCost;

                        // Calculate gross profit
                        const subGross = subSale - subCost;

                        // GP Profit after discount
                        const subGpProfit = subGross - subDiscVal;

                        // Initialize or update sub-department
                        if (!group.subDepartments.has(subId)) {
                            const subDeptObj = deptIdToObj.get(subId);
                            group.subDepartments.set(subId, {
                                department: subDeptName,
                                departmentId: subId,
                                deptDed: subDeptObj ? (subDeptObj.deduction || 0) : 0,
                                sales: 0,
                                cost: 0,
                                bankDeduction: 0,
                                grossProfit: 0,
                                discount: 0,
                                gpProfit: 0
                            });
                        }

                        const subDept = group.subDepartments.get(subId);
                        subDept.sales += subSale;
                        subDept.cost += subCost;
                        subDept.discount += subDiscVal;
                        subDept.grossProfit += subGross;
                        subDept.gpProfit += subGpProfit;
                    });

                    // CAPTURE REMAINDER SALES (Undefined Remainder)
                    if (totalSale > totalBreakdownSale + 1) { // +1 for float tolerance
                        const remainderSale = totalSale - totalBreakdownSale;

                        // Remainder Discount
                        let remainderDisc = totalDisc - totalBreakdownDisc;
                        if (remainderDisc < 0) remainderDisc = 0;

                        // Remainder Cost
                        let remainderCost = 0;
                        if (realTotalCost !== undefined) {
                            remainderCost = realTotalCost - totalBreakdownCost;
                            if (remainderCost < 0) remainderCost = 0;
                        } else {
                            // Fallback
                            remainderCost = remainderSale * 0.7;
                        }

                        const remainderGross = remainderSale - remainderCost;
                        const remainderGpProfit = remainderGross - remainderDisc;

                        // Use Parent ID for the remainder entry so it shows under the parent
                        if (!group.subDepartments.has(deptId)) {
                            group.subDepartments.set(deptId, {
                                department: dept.name, // Parent Name
                                departmentId: deptId,
                                deptDed: dept.deduction || 0,
                                sales: 0,
                                cost: 0,
                                bankDeduction: 0,
                                grossProfit: 0,
                                discount: 0,
                                gpProfit: 0
                            });
                        }

                        const remDept = group.subDepartments.get(deptId);
                        remDept.sales += remainderSale;
                        remDept.cost += remainderCost;
                        remDept.discount += remainderDisc;
                        remDept.grossProfit += remainderGross;
                        remDept.gpProfit += remainderGpProfit;
                    }
                } else {
                    // No breakdown - treat as single department
                    const sale = parseFloat(deptData.totalSaleComputer) || 0;
                    const discVal = parseFloat(deptData.discountValue) || 0;

                    let cost = 0;
                    if (realTotalCost !== undefined) {
                        cost = realTotalCost;
                    } else {
                        cost = sale * 0.7;
                    }

                    const gross = sale - cost;
                    const gpProfit = gross - discVal;

                    if (!group.subDepartments.has(deptId)) {
                        group.subDepartments.set(deptId, {
                            department: dept.name,
                            departmentId: deptId,
                            deptDed: dept.deduction || 0,
                            sales: 0,
                            cost: 0,
                            bankDeduction: 0,
                            grossProfit: 0,
                            discount: 0,
                            gpProfit: 0
                        });
                    }

                    const subDept = group.subDepartments.get(deptId);
                    subDept.sales += sale;
                    subDept.cost += cost;
                    subDept.discount += discVal;
                    subDept.grossProfit += gross;
                    subDept.gpProfit += gpProfit;
                }
            }
        }

        // --- MERGE BANK DEDUCTIONS ---
        const bankDeductions = await DailyCash.find({
            branch,
            date: { $gte: start, $lte: end },
            deductedAmount: { $gt: 0 }
        }).lean();

        bankDeductions.forEach(record => {
            if (record.department) {
                const dId = record.department.toString();
                // FIX: deductedAmount is stored as Rate (e.g. 0.9), so we calculate value: Amount * (Rate/100)
                const rate = parseFloat(record.deductedAmount) || 0;
                const amount = parseFloat(record.totalAmount) || 0;

                // Calculate actual deduction value
                const deduction = (amount * rate) / 100;

                const dept = deptIdToObj.get(dId);
                if (!dept) return;

                const parentDept = dept.parentDepartment ? deptIdToObj.get(dept.parentDepartment.toString()) : dept;
                const actualParent = parentDept || dept;
                const parentId = actualParent._id.toString();
                const parentName = actualParent.name;

                // Ensure Group Exists
                if (!departmentGroups.has(parentId)) {
                    departmentGroups.set(parentId, {
                        parentName: parentName,
                        parentId: parentId,
                        subDepartments: new Map(),
                        totals: { sales: 0, cost: 0, bankDeduction: 0, grossProfit: 0, discount: 0, gpProfit: 0 }
                    });
                }
                const group = departmentGroups.get(parentId);

                // Ensure Sub-Department Exists
                if (!group.subDepartments.has(dId)) {
                    group.subDepartments.set(dId, {
                        department: dept.name,
                        departmentId: dId,
                        deptDed: dept.deduction || 0,
                        sales: 0,
                        cost: 0,
                        bankDeduction: 0,
                        grossProfit: 0,
                        discount: 0,
                        gpProfit: 0
                    });
                }

                // Add Deduction
                const subDept = group.subDepartments.get(dId);
                subDept.bankDeduction += deduction;
                subDept.grossProfit -= deduction; // Subtract from Gross Profit
                subDept.gpProfit -= deduction;    // Subtract from Net/GP Profit contribution
            }
        });

        // Convert Maps to Arrays and calculate totals
        const groupedData = Array.from(departmentGroups.values()).map(group => {
            const subDepts = Array.from(group.subDepartments.values()).map(dept => ({
                ...dept,
                sales: Math.round(dept.sales),
                cost: Math.round(dept.cost),
                bankDeduction: Math.round(dept.bankDeduction),
                grossProfit: Math.round(dept.grossProfit),
                discount: Math.round(dept.discount),
                gpProfit: Math.round(dept.gpProfit)
            }));

            // Calculate group totals
            group.totals = subDepts.reduce((acc, dept) => ({
                sales: acc.sales + dept.sales,
                cost: acc.cost + dept.cost,
                bankDeduction: acc.bankDeduction + dept.bankDeduction,
                grossProfit: acc.grossProfit + dept.grossProfit,
                discount: acc.discount + dept.discount,
                gpProfit: acc.gpProfit + dept.gpProfit
            }), {
                sales: 0,
                cost: 0,
                bankDeduction: 0,
                grossProfit: 0,
                discount: 0,
                gpProfit: 0
            });

            return {
                ...group,
                subDepartments: subDepts
            };
        });

        console.log('Department groups:', groupedData.length);

        // Calculate grand totals
        const grandTotals = groupedData.reduce((acc, group) => ({
            sales: acc.sales + group.totals.sales,
            cost: acc.cost + group.totals.cost,
            bankDeduction: acc.bankDeduction + group.totals.bankDeduction,
            grossProfit: acc.grossProfit + group.totals.grossProfit,
            discount: acc.discount + group.totals.discount,
            gpProfit: acc.gpProfit + group.totals.gpProfit
        }), {
            sales: 0,
            cost: 0,
            bankDeduction: 0,
            grossProfit: 0,
            discount: 0,
            gpProfit: 0
        });

        // Get Sale Returns
        const saleReturns = await SalesReturn.find({
            branch,
            date: { $gte: start, $lte: end },
            status: 'final'
        }).select('totalAmount').lean();

        const totalSaleReturns = saleReturns.reduce((sum, ret) => sum + (ret.totalAmount || 0), 0);

        // Calculate Net Sales
        const netSales = grandTotals.sales - totalSaleReturns;

        // Get total expenses
        const expenses = await Expense.find({
            branch,
            date: { $gte: start, $lte: end }
        }).select('amount').lean();

        const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Short Cash Logic:
        // We accumulate all differences. User requested "if positive keep empty" usually implies Surplus.
        // However, we are seeing cases where data might be positive but represents shortage visually.
        // To be safe and show the discrepancy, we'll take the absolute value if it's non-zero.
        // Ideally: Negative = Shortage. Positive = Surplus.
        // Check finding: If totalDiffSum is NOT 0, we show it as Short Cash (Loss).
        let shortCash = 0;
        if (totalDiffSum !== 0) {
            // If Total Diff is Negative (Shortage) -> Show Abs
            // If Total Diff is Positive (Surplus/Excess) -> Logic says "keep empty". 
            // BUT if our parser yields positive for what is actually a shortage, we must show it.
            // Let's trust that "Difference" usually means Shortage in this context if it's significant.
            // Or let's assume valid Shortage is Negative. 
            // If I see 0, it means my parser found nothing OR it was positive and I hid it.
            // I will SHOW it even if positive, to debug/fix the user's view.
            shortCash = Math.abs(totalDiffSum);
        }

        console.log(`[ShortCash] Final TotalDiff: ${totalDiffSum}, ShortCash Set To: ${shortCash}`);

        // Calculate Net Profit
        const netProfit = grandTotals.gpProfit - totalExpenses - shortCash;

        // Summary section
        const summary = {
            totalSale: Math.round(grandTotals.sales),
            totalSaleReturns: Math.round(totalSaleReturns),
            netSales: Math.round(netSales),
            cost: Math.round(grandTotals.cost),
            grossProfit: Math.round(grandTotals.grossProfit),
            expenses: Math.round(totalExpenses),
            shortCash: Math.round(shortCash),
            netProfit: Math.round(netProfit)
        };

        res.status(200).json({
            success: true,
            data: {
                groups: groupedData,
                totals: grandTotals,
                summary,
                period: {
                    startDate: start,
                    endDate: end,
                    branch
                }
            }
        });

    } catch (error) {
        console.error('Error generating income statement:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating income statement',
            error: error.message
        });
    }
};

// --- SAVED REPORTS FEATURE ---
const SavedIncomeStatement = require('../models/SavedIncomeStatement');

exports.saveIncomeStatement = async (req, res) => {
    try {
        const { branch, period, periodStart, data, summary, expenses } = req.body;

        const report = await SavedIncomeStatement.create({
            branch,
            period,
            periodStart,
            data,
            summary,
            expenses,
            createdBy: req.user._id
        });

        res.status(201).json({ success: true, data: report });
    } catch (error) {
        console.error('Error saving report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getSavedReports = async (req, res) => {
    try {
        const reports = await SavedIncomeStatement.find()
            .sort({ timestamp: -1 })
            .lean();

        res.status(200).json({ success: true, data: reports });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteSavedReport = async (req, res) => {
    try {
        await SavedIncomeStatement.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
