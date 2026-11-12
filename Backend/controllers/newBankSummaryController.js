const asyncHandler = require('../middleware/async');
const Bank = require('../models/Bank');
const BankTransaction = require('../models/BankTransaction');
const DailyCash = require('../models/DailyCash');
const mongoose = require('mongoose');

// @desc    Get Professional Bank Summary (Pro)
// @route   GET /api/v1/reports/bank-summary-pro
// @access  Private
exports.getProBankSummary = asyncHandler(async (req, res) => {
    const { startDate, endDate, branch, department, bankIds, type } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Please provide date range' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Filter Logic setup
    let targetBankIds = [];
    let targetBankNames = []; // Need names for BankTransaction query as it lacks ObjectId ref

    if (bankIds) {
        targetBankIds = bankIds.split(',');
        // Fetch Names for these IDs to query BankTransaction
        const banks = await Bank.find({ _id: { $in: targetBankIds } }).select('bankName');
        targetBankNames = banks.map(b => b.bankName);
    } else {
        // If branch provided, get all banks in branch.
        if (branch) {
            const bList = await Bank.find({ branch }).select('_id bankName');
            targetBankIds = bList.map(b => b._id.toString());
            targetBankNames = bList.map(b => b.bankName);
        }
    }

    // 1. Calculate Opening Balance (Strictly < start)
    // Sources: Daily Cash + Bank Transactions

    // A. Daily Cash Opening (Uses Bank ObjectId)
    const dcOpenMatch = {
        mode: 'Bank'
    };
    if (targetBankIds.length > 0) dcOpenMatch.bank = { $in: targetBankIds.map(id => new mongoose.Types.ObjectId(id)) };
    if (department) dcOpenMatch.department = new mongoose.Types.ObjectId(department);
    if (branch) dcOpenMatch.branch = branch;

    const dcOpenData = await DailyCash.aggregate([
        { $match: dcOpenMatch },
        {
            $addFields: {
                effectiveDate: {
                    $cond: {
                        if: { $and: [{ $eq: ["$isVerified", true] }, { $ne: [{ $ifNull: ["$verifiedDate", null] }, null] }] },
                        then: "$verifiedDate",
                        else: "$date"
                    }
                }
            }
        },
        {
            $match: {
                effectiveDate: { $lt: start }
            }
        }
    ]);
    let openingBal = 0;

    dcOpenData.forEach(item => {
        const rate = (item.deductedAmount || 0);
        const deductionAmount = Math.round((item.totalAmount || 0) * (rate / 100));
        const netAmount = (item.totalAmount || 0) - deductionAmount;
        openingBal += netAmount;
    });

    // B. Bank Transaction Opening (Uses Bank Name string)
    // Effective Date Logic: ChequeDate > Date
    const btPipelineOpen = [
        { $match: {} } // Placeholder for Match Stage
    ];

    // Construct Match Stage
    const btMatch = {};
    if (targetBankNames.length > 0) btMatch.bankName = { $in: targetBankNames };
    if (branch) btMatch.branch = branch;

    // Department Filtering: Check both direct department field AND banks belonging to department
    if (department) {
        // Get all banks that belong to this department
        const deptBanks = await Bank.find({ department: department }).select('bankName');
        const deptBankNames = deptBanks.map(b => b.bankName);

        // Filter by either:
        // 1. BankTransaction has department field set, OR
        // 2. BankTransaction's bankName is in the list of banks belonging to this department
        if (deptBankNames.length > 0) {
            btMatch.$or = [
                { department: department },
                { bankName: { $in: deptBankNames } }
            ];
        } else {
            // If no banks found for this department, only match direct department field
            btMatch.department = department;
        }
    }

    btPipelineOpen[0].$match = btMatch;

    btPipelineOpen.push({
        $addFields: {
            effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
            normType: { $toLower: { $ifNull: ["$type", ""] } },
            normTransType: { $toLower: { $ifNull: ["$transactionType", ""] } }
        }
    });

    btPipelineOpen.push({
        $match: {
            effectiveDate: { $lt: start }
        }
    });

    btPipelineOpen.push({
        $group: {
            _id: null,
            total: {
                $sum: {
                    $cond: [
                        {
                            $or: [
                                { $in: ["$normType", ["deposit", "received"]] },
                                { $in: ["$normTransType", ["deposit", "received"]] }
                            ]
                        },
                        "$amount",
                        { $multiply: ["$amount", -1] }
                    ]
                }
            }
        }
    });

    const btOpenRes = await BankTransaction.aggregate(btPipelineOpen);
    if (btOpenRes.length > 0) {
        openingBal += btOpenRes[0].total;
    }


    // 2. Fetch Transactions List (Start <= Effective <= End)
    let transactions = [];

    // A. Daily Cash List
    const dcListMatch = {
        mode: 'Bank'
    };
    if (targetBankIds.length > 0) dcListMatch.bank = { $in: targetBankIds.map(id => new mongoose.Types.ObjectId(id)) };
    if (branch) dcListMatch.branch = branch;
    if (department) dcListMatch.department = new mongoose.Types.ObjectId(department);

    // Filter by Type (Batch Transfer Only)
    let includeDC = true;
    if (type && type !== 'All Types' && type !== 'Batch Transfer') includeDC = false;

    if (includeDC) {
        const dcList = await DailyCash.aggregate([
            { $match: dcListMatch },
            {
                $addFields: {
                    effectiveDate: {
                        $cond: {
                            if: { $and: [{ $eq: ["$isVerified", true] }, { $ne: [{ $ifNull: ["$verifiedDate", null] }, null] }] },
                            then: "$verifiedDate",
                            else: "$date"
                        }
                    }
                }
            },
            {
                $match: {
                    effectiveDate: { $gte: start, $lte: end }
                }
            },
            {
                $lookup: {
                    from: "banks",
                    localField: "bank",
                    foreignField: "_id",
                    as: "bankInfo"
                }
            },
            { $unwind: { path: "$bankInfo", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "departments",
                    localField: "department",
                    foreignField: "_id",
                    as: "deptInfo"
                }
            },
            { $unwind: { path: "$deptInfo", preserveNullAndEmptyArrays: true } }
        ]);

        dcList.forEach(item => {
            const rate = (item.deductedAmount || 0);
            const deductionAmount = Math.round((item.totalAmount || 0) * (rate / 100));
            const netAmount = (item.totalAmount || 0) - deductionAmount;

            transactions.push({
                date: item.effectiveDate,
                effectiveDate: item.effectiveDate,
                type: 'Batch Transfer',
                ref: item.batchNo || '-',
                description: item.remarks ? `Batch Transfer (Regular) - ${item.remarks}` : 'Batch Transfer',
                debit: 0,
                credit: 0,
                deposit: netAmount, // Use calculated net amount (after deduction)
                withdrawal: 0,
                status: item.isVerified ? 'Verified' : 'Unverified',
                bankName: item.bankInfo?.bankName || '-'
            });
        });
    }

    // B. Bank Transaction List
    // We use similar pipeline match but different range
    const btPipelineList = [
        { $match: btMatch },
        {
            $addFields: {
                effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
                normType: { $toLower: { $ifNull: ["$type", ""] } },
                normTransType: { $toLower: { $ifNull: ["$transactionType", ""] } }
            }
        },
        {
            $match: {
                effectiveDate: { $gte: start, $lte: end }
            }
        }
    ];

    const btListRes = await BankTransaction.aggregate(btPipelineList);
    // console.log("BT List Count:", btListRes.length);

    btListRes.forEach(item => {
        const isDeposit = ['deposit', 'received'].includes(item.normType) || ['deposit', 'received'].includes(item.normTransType);

        let typeStr = isDeposit ? 'Deposit' : 'Withdrawal';
        // Check for Bank Transfer
        if (item.refType === 'bank_transfer' || (item.narration && item.narration.toLowerCase().includes('bank transfer'))) {
            typeStr = 'Bank Transfer';
        }

        // Filter by Type Query
        if (type && type !== 'All Types' && type !== typeStr) return;

        // Ensure "Paid" and "Received" are mapped if user types query string manually, but typically filters are standard.

        const bankName = item.bankName || '-';

        transactions.push({
            // USER REQUIREMENT: Show Cheque Date key as "Date" in the table if available
            date: item.effectiveDate,
            effectiveDate: item.effectiveDate,
            type: typeStr,
            ref: item.invoiceNo || '-',
            description: item.narration || item.remarks || '-',
            debit: 0,
            credit: 0,
            deposit: isDeposit ? item.amount : 0,
            withdrawal: !isDeposit ? item.amount : 0,
            status: 'Verified', // Bank Txns are usually final
            bankName: bankName
        });
    });

    // Sort by Effective Date
    transactions.sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));

    // Calculate Running Balance
    let runningBalance = openingBal;
    const finalData = transactions.map(t => {
        const movement = (t.deposit || 0) - (t.withdrawal || 0);
        runningBalance += movement;
        return {
            ...t,
            balance: runningBalance
        };
    });

    res.status(200).json({
        success: true,
        data: {
            openingBalance: openingBal,
            transactions: finalData,
            closingBalance: runningBalance
        }
    });

});

// @desc    Get All Bank Balances for a Branch on a Date (For SMS/Daily Reporting)
// @route   GET /api/v1/reports/bank-ledger/all-balances-pro
exports.getAllBankBalances = asyncHandler(async (req, res) => {
    const { date, branch } = req.query;

    if (!date) {
        return res.status(400).json({ success: false, message: 'Please provide date' });
    }

    const reportDate = new Date(date);
    // Set to End of Day to include all transactions for that date
    reportDate.setHours(23, 59, 59, 999);

    // 1. Get All Banks for Branch
    const bankQuery = {};
    if (branch) bankQuery.branch = branch;
    const banks = await Bank.find(bankQuery).populate('department', 'name').lean();

    // Map for fast lookup and aggregation
    // Key: Bank._id (String) -> { displayName, balance: 0, bankName }
    const bankMap = {};
    // Name Map to resolve BankTransactions that store 'bankName' string
    const nameToIdMap = {};

    banks.forEach(b => {
        const idStr = b._id.toString();
        bankMap[idStr] = {
            _id: idStr,
            bankName: b.bankName,
            // Format Display Name: Name (Dep)
            displayName: b.bankName,
            balance: 0
        };
        if (b.bankName) {
            nameToIdMap[b.bankName.trim().toUpperCase()] = idStr;
        }
    });

    // 2. Aggregate Daily Cash (Batch Transfers)
    // Rule: mode='Bank', date <= reportDate
    const dcPipeline = [
        {
            $match: {
                mode: 'Bank',
                ...(branch && { branch: branch })
            }
        },
        {
            $addFields: {
                effectiveDate: {
                    $cond: {
                        if: { $and: [{ $eq: ["$isVerified", true] }, { $ne: [{ $ifNull: ["$verifiedDate", null] }, null] }] },
                        then: "$verifiedDate",
                        else: "$date"
                    }
                }
            }
        },
        {
            $match: {
                effectiveDate: { $lte: reportDate }
            }
        },
        {
            $group: {
                _id: "$bank", // Group by Bank ID
                total: {
                    $sum: {
                        $subtract: [
                            "$totalAmount",
                            {
                                $round: [
                                    { $multiply: ["$totalAmount", { $divide: [{ $ifNull: ["$deductedAmount", 0] }, 100] }] },
                                    0
                                ]
                            }
                        ]
                    }
                }
            }
        }
    ];

    const dcResults = await DailyCash.aggregate(dcPipeline);
    dcResults.forEach(res => {
        if (res._id && bankMap[res._id.toString()]) {
            bankMap[res._id.toString()].balance += (res.total || 0);
        }
    });

    // 3. Aggregate Bank Transactions
    // Rule: effectiveDate <= reportDate
    const btPipeline = [
        {
            $match: {
                ...(branch && { branch: branch })
            }
        },
        {
            $addFields: {
                effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
                normType: { $toLower: { $ifNull: ["$type", ""] } },
                normTransType: { $toLower: { $ifNull: ["$transactionType", ""] } }
            }
        },
        {
            $match: {
                effectiveDate: { $lte: reportDate }
            }
        },
        {
            $group: {
                _id: "$bankName", // Group by Bank Name string
                total: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $in: ["$normType", ["deposit", "received"]] },
                                    { $in: ["$normTransType", ["deposit", "received"]] }
                                ]
                            },
                            "$amount",
                            { $multiply: ["$amount", -1] }
                        ]
                    }
                }
            }
        }
    ];

    const btResults = await BankTransaction.aggregate(btPipeline);
    btResults.forEach(res => {
        if (res._id) {
            const nameKey = res._id.trim().toUpperCase();
            const id = nameToIdMap[nameKey];
            if (id && bankMap[id]) {
                bankMap[id].balance += (res.total || 0);
            } else {
                // Determine if we should count this (orphan transaction or bank outside branch filter)
                // If branch filter was applied in match, this belongs to the branch but maybe Bank record is missing/inactive?
                // We'll skip strictly to known banks to avoid garbage
            }
        }
    });

    // 4. Format Result
    let finalBanks = Object.values(bankMap).map(b => ({
        bankName: b.bankName,
        displayName: b.bankName, // Use simple name to avoid duplication like 'Alf (Med) (Med)'
        balance: b.balance
    }));

    // Filter out 0 balances and specific 'Branch Bank' label if it exists
    finalBanks = finalBanks.filter(b => b.balance !== 0 && b.bankName !== 'Branch Bank');

    // Calculate Total (Includes all banks? Or only shown ones? Usually total available)
    // User requested "Balance" in SMS. usually matches the sum of items shown.
    // So we sum the filtered list.
    const totalBalance = finalBanks.reduce((sum, b) => sum + b.balance, 0);

    res.status(200).json({
        success: true,
        banks: finalBanks,
        totalBalance
    });
});
