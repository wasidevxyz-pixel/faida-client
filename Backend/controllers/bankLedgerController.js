const asyncHandler = require('../middleware/async');
const Bank = require('../models/Bank');
const BankTransaction = require('../models/BankTransaction');
const DailyCash = require('../models/DailyCash');
const BankTransfer = require('../models/BankTransfer');
const Department = require('../models/Department');
const Store = require('../models/Store'); // Required for Branch ID lookup
const mongoose = require('mongoose');

// @desc    Get Bank Ledger Report with Advanced Filtering
// @route   GET /api/v1/reports/bank-ledger
// @access  Private
exports.getBankLedgerReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, startInvDate, endInvDate, bankId, branch, departmentId } = req.query;

    if (!bankId) {
        return res.status(400).json({ success: false, message: 'Please select a bank' });
    }

    const start = startDate ? new Date(startDate) : new Date(0);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const hasInvDateFilter = startInvDate || endInvDate;

    // Get the Bank
    const bank = await Bank.findById(bankId);
    if (!bank) {
        return res.status(404).json({ success: false, message: 'Bank not found' });
    }

    // Force usage of Query Branch (String) if available to avoid ObjectId vs Name mismatches
    if (branch) {
        bank.branch = branch;
    }

    // Resolve Branch ID if branch name is provided (for robust filtering)
    let branchId = null;
    if (branch) {
        const store = await Store.findOne({ name: branch }).select('_id').lean();
        if (store) branchId = store._id;
    }

    console.log('=== BANK LEDGER REPORT ===');
    console.log('Bank:', bank.bankName);
    console.log('Branch:', branch || 'All', '(ID:', branchId, ')');
    console.log('Department:', departmentId || 'All');
    console.log('Date Range:', start.toISOString().split('T')[0], 'to', end.toISOString().split('T')[0]);
    console.log('Inv Date Filter:', hasInvDateFilter ? 'YES' : 'NO');

    const transactions = [];

    // 1. DAILY CASH ENTRIES (Type: Bank)
    // Only fetch DailyCash if NO invoice date filter is applied (as they don't have invoice dates)
    if (!hasInvDateFilter) {
        const dcMatch = {
            bank: bank._id,
            mode: 'Bank',
            isVerified: true
        };

        // Strict Branch Filter
        if (branch) {
            dcMatch.$or = [{ branch: branch }];
            if (branchId) dcMatch.$or.push({ branch: branchId });
        }

        if (departmentId) {
            dcMatch.department = new mongoose.Types.ObjectId(departmentId);
        }

        const dailyCashEntries = await DailyCash.aggregate([
            { $match: dcMatch },
            {
                $addFields: {
                    // Use Verified Date if verified, else original date
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
            // Lookup Department
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

        console.log('Daily Cash (Aggregated) found:', dailyCashEntries.length);

        dailyCashEntries.forEach(dc => {
            let amount = parseFloat(dc.totalAmount) || 0;

            // User Request: If Deduction (Verified Batch), show Net Amount
            const deductionRate = parseFloat(dc.deductedAmount) || 0;
            if (dc.isDeduction || deductionRate > 0) {
                const deductionVal = (amount * deductionRate) / 100;
                amount = Math.round(amount - deductionVal);
            }

            // If verified, show "Batch Transfered" in remarks
            const remarksText = dc.isVerified ? 'Batch Transfered' : (dc.remarks || '');

            transactions.push({
                date: dc.effectiveDate,
                narration: `Daily Cash`,
                remarks: remarksText,
                batchNo: dc.batchNo || '-',
                invoiceDate: null,
                department: dc.deptInfo?.name || '-',
                type: 'Daily Cash',
                debit: amount, // Received (Net Amount)
                credit: 0,
                sortDate: new Date(dc.effectiveDate).getTime()
            });
        });
    }


    // 2. BANK TRANSACTIONS (Received & Paid)
    // Refactored to use Aggregation for Consistent "Effective Date" logic (matching Opening Balance)
    const btMatchArg = {
        $and: [
            {
                $or: [
                    { bank: bank._id },
                    {
                        bankName: bank.bankName,
                        branch: branch || bank.branch // Enforce branch only for name match
                    }
                ]
            },
            { refType: { $ne: 'bank_transfer' } },
            { narration: { $not: /^Bank Transfer/i } }
        ]
    };

    if (departmentId) {
        btMatchArg.department = new mongoose.Types.ObjectId(departmentId);
    }

    const btListPipeline = [
        { $match: btMatchArg },
        {
            $addFields: {
                // Calculate Effective Date for filtering
                effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
                normType: { $toLower: { $ifNull: ["$type", ""] } }
            }
        },
        {
            $match: {
                effectiveDate: { $gte: start, $lte: end }
            }
        },
        // Lookup Department
        {
            $lookup: {
                from: "departments",
                localField: "department",
                foreignField: "_id",
                as: "deptInfo"
            }
        },
        { $unwind: { path: "$deptInfo", preserveNullAndEmptyArrays: true } }
    ];

    if (hasInvDateFilter) {
        // Invoice Date Filter applied to invoiceDate field (usually Booking Date concept, but keeping as is)
        if (startInvDate) btListPipeline.push({ $match: { invoiceDate: { $gte: new Date(startInvDate) } } });
        if (endInvDate) btListPipeline.push({ $match: { invoiceDate: { $lte: new Date(endInvDate) } } });
    }

    const bankTransactions = await BankTransaction.aggregate(btListPipeline);
    console.log('Bank Transactions (Aggregated) found:', bankTransactions.length);

    bankTransactions.forEach(bt => {
        // Determine if it is a Receipt (Deposit/Add) or Payment (Withdrawal/Subtract)
        // Must match calculateOpeningBalance logic EXACTLY
        const isReceipt =
            ['deposit', 'received', 'receipt', 'opening balance'].includes(bt.normType) ||
            ['deposit', 'received', 'receipt', 'opening balance'].includes(bt.normTransType);

        // Map fields
        transactions.push({
            date: bt.effectiveDate || bt.date,
            narration: bt.narration || bt.remarks || 'Bank Transaction',
            remarks: bt.remarks || '',
            batchNo: bt.invoiceNo || '-',
            // Only show Inv Date for Payments (not receipts)
            invoiceDate: isReceipt ? null : (bt.invoiceDate || null),
            department: bt.deptInfo ? bt.deptInfo.name : '-',
            type: isReceipt ? 'Bank Receipt' : 'Bank Payment',
            debit: isReceipt ? bt.amount : 0,
            credit: !isReceipt ? bt.amount : 0,
            sortDate: new Date(bt.effectiveDate || bt.date).getTime()
        });
    });

    // 3. BANK TO BANK TRANSFERS
    const transferQuery = {
        date: { $gte: start, $lte: end },
        $or: [
            { fromBank: bank._id },
            { toBank: bank._id }
        ]
    };

    const bankTransfers = await BankTransfer.find(transferQuery)
        .populate('fromBank', 'bankName')
        .populate('toBank', 'bankName')
        .lean();

    console.log('Bank Transfers found:', bankTransfers.length);

    bankTransfers.forEach(transfer => {
        // Use optional chaining and toString() for safe ID comparison
        const fromBankId = transfer.fromBank?._id?.toString() || transfer.fromBank?.toString();
        const currentBankId = bank._id.toString();

        const isFrom = fromBankId === currentBankId;

        const otherBankName = isFrom
            ? (transfer.toBank?.bankName || 'Unknown Bank')
            : (transfer.fromBank?.bankName || 'Unknown Bank');

        transactions.push({
            date: transfer.date,
            narration: isFrom
                ? `Transfer to ${otherBankName}`
                : `Transfer from ${otherBankName}`,
            remarks: transfer.remarks || '',
            batchNo: transfer.batchNo || '-',
            invoiceDate: null,
            department: '-',
            type: 'Bank Transfer',
            debit: isFrom ? 0 : transfer.amount, // Received if TO this bank
            credit: isFrom ? transfer.amount : 0, // Paid if FROM this bank
            sortDate: new Date(transfer.date).getTime()
        });
    });

    // Calculate Opening Balance
    const openingBalance = await calculateOpeningBalance(bank, start, departmentId);

    // Sort transactions by date
    transactions.sort((a, b) => a.sortDate - b.sortDate);

    // Calculate running balance
    let runningBalance = openingBalance;
    const finalTransactions = transactions.map(tx => {
        runningBalance += tx.debit - tx.credit;
        return {
            ...tx,
            balance: runningBalance
        };
    });

    const totalDebit = transactions.reduce((sum, tx) => sum + tx.debit, 0);
    const totalCredit = transactions.reduce((sum, tx) => sum + tx.credit, 0);

    console.log('Total Transactions:', finalTransactions.length);
    console.log('Total Debit:', totalDebit);
    console.log('Total Credit:', totalCredit);
    console.log('========================');

    res.status(200).json({
        success: true,
        data: {
            bankName: bank.bankName,
            branch: bank.branch,
            openingBalance,
            transactions: finalTransactions,
            closingBalance: runningBalance,
            totalDebit,
            totalCredit
        }
    });
});

// Helper function to calculate opening balance
async function calculateOpeningBalance(bank, startDate, departmentId) {
    let balance = 0;

    // 1. Daily Cash (Batch Transfers) - BEFORE Start Date
    // ROBUST LOGIC: Match List View's Fallback strategy
    // Find all Bank IDs that match this Key Name (Legacy support)
    const banksWithName = await Bank.find({ bankName: bank.bankName }).select('_id').lean();
    const bankIds = banksWithName.map(b => b._id);
    // Ensure current ID is included
    if (!bankIds.some(id => id.toString() === bank._id.toString())) {
        bankIds.push(bank._id);
    }

    // Resolve Branch ID for OB filter
    let branchId = null;
    const branchName = bank.branch; // Assuming bank.branch is set to Name string in main func
    if (branchName) {
        const store = await Store.findOne({ name: branchName }).select('_id').lean();
        if (store) branchId = store._id;
    }

    const dcMatch = {
        mode: 'Bank',
        isVerified: true,
        bank: { $in: bankIds } // Match ANY ID associated with this Bank Name
    };

    // Apply Branch Filter if available
    if (branchName) {
        dcMatch.$or = [{ branch: branchName }];
        if (branchId) dcMatch.$or.push({ branch: branchId });
    }

    if (departmentId) dcMatch.department = new mongoose.Types.ObjectId(departmentId);

    const dcHistory = await DailyCash.aggregate([
        { $match: dcMatch },
        {
            $addFields: {
                // Use Verified Date if verified, else original date
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
                effectiveDate: { $lt: startDate }
            }
        }
    ]);

    // Calculate Total with Deductions Logic (matching List View)
    let dcTotal = 0;
    dcHistory.forEach(dc => {
        let amount = parseFloat(dc.totalAmount) || 0;
        const deductionRate = parseFloat(dc.deductedAmount) || 0;

        if (dc.isDeduction || deductionRate > 0) {
            const deductionVal = (amount * deductionRate) / 100;
            amount = Math.round(amount - deductionVal);
        }
        dcTotal += amount;
    });

    balance += dcTotal;


    // 2. Bank Transactions (Withdrawals/Deposits) - BEFORE Start Date
    // MATCH LIST LOGIC: Exclude Bank Transfers from here, sum them separately.
    const btPipeline = [
        {
            $match: {
                $or: [
                    { bank: bank._id }, // Match by ID
                    {
                        bankName: bank.bankName,
                        branch: bank.branch // Match by Name
                    }
                ]
            }
        }
    ];

    if (departmentId) {
        btPipeline[0].$match.department = new mongoose.Types.ObjectId(departmentId);
    }

    // Add Effective Date Logic
    btPipeline.push({
        $addFields: {
            effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
            normType: { $toLower: { $ifNull: ["$type", ""] } },
            normTransType: { $toLower: { $ifNull: ["$transactionType", ""] } }
        }
    });

    btPipeline.push({
        $match: {
            effectiveDate: { $lt: startDate },
            // EXCLUDE transfers here to match 'getBankLedgerReport' logic and avoid duplicates/gaps
            // Only exclude explicit system Bank Transfers. Manual manual entries with "Bank Transfer" narration should be included!
            $and: [
                { refType: { $ne: 'bank_transfer' } }
            ]
        }
    });

    // Group and Sum
    btPipeline.push({
        $group: {
            _id: null,
            totalAmount: {
                $sum: {
                    $cond: [
                        {
                            $or: [
                                { $in: ["$normType", ["deposit", "received", "receipt", "opening balance"]] },
                                { $in: ["$normTransType", ["deposit", "received", "receipt", "opening balance"]] }
                            ]
                        },
                        { $toDouble: "$amount" },       // SAFE CAST: Ensure amount is treated as number
                        { $multiply: [{ $toDouble: "$amount" }, -1] } // Else (Withdrawal): Subtract Amount
                    ]
                }
            }
        }
    });

    const btResult = await BankTransaction.aggregate(btPipeline);
    const btTotal = btResult.length > 0 ? btResult[0].totalAmount : 0;
    balance += btTotal;


    // 3. Bank Transfers (Before Start Date)
    // FIX: Re-enable logic to fetch transfers from BankTransfer model
    const transferQuery = {
        date: { $lt: startDate },
        $or: [
            { fromBank: bank._id },
            { toBank: bank._id }
        ]
    };

    // STRICT MODE: No Multi-ID fallback to match confirmed correct balance logic

    const transfers = await BankTransfer.find(transferQuery).lean();

    let transferTotal = 0;
    transfers.forEach(t => {
        const amount = parseFloat(t.amount) || 0;

        // Check if we are the Receiver (To) or Sender (From)
        const isReceiver = t.toBank?.toString() === bank._id.toString();

        if (isReceiver) {
            transferTotal += amount; // Received -> Add
        } else {
            transferTotal -= amount; // Sent -> Subtract
        }
    });

    balance += transferTotal;

    return balance;
}


// @desc    Get Aggregate Bank Balance for all banks in a Branch as of a specific date
// @route   GET /api/v1/reports/bank-ledger/branch-balance
// @access  Private
exports.getBranchBankBalance = asyncHandler(async (req, res) => {
    const { branch, date } = req.query;

    if (!branch || !date) {
        return res.status(400).json({ success: false, message: 'Please provide branch and date' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(23, 59, 59, 999);

    // Get all banks for the branch
    // EXCLUDE all Easypaisa banks
    const banks = await Bank.find({
        branch: branch,
        bankName: { $not: /easypaisa/i }
    }).lean();

    if (!banks || banks.length === 0) {
        return res.status(200).json({ success: true, totalBalance: 0, message: 'No banks found' });
    }

    let totalBalance = 0;

    // Calculate closing balance for each bank
    // We reuse calculateOpeningBalance by passing the NEXT day's start, 
    // which effectively gives us the closing balance of the target date.
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    for (const bank of banks) {
        const bankBal = await calculateOpeningBalance(bank, nextDay);
        totalBalance += bankBal;
    }

    res.status(200).json({
        success: true,
        totalBalance,
        bankCount: banks.length
    });
});

// @desc    Get Individual Bank Balances for all banks in a Branch as of a specific date
// @route   GET /api/v1/reports/bank-ledger/branch-bank-balances
// @access  Private
exports.getBranchBankBalances = asyncHandler(async (req, res) => {
    const { branch, date } = req.query;

    if (!branch || !date) {
        return res.status(400).json({ success: false, message: 'Please provide branch and date' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(23, 59, 59, 999);

    // Get all banks for the branch - EXCLUDE Branch Bank type
    const banks = await Bank.find({
        branch: branch,
        bankType: { $ne: 'Branch Bank' } // Exclude Branch Bank type
    }).populate('department', 'name').lean();

    if (!banks || banks.length === 0) {
        return res.status(200).json({ success: true, banks: [], totalBalance: 0, message: 'No banks found' });
    }

    // Calculate closing balance for each bank
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    const bankBalances = [];
    let totalBalance = 0;

    for (const bank of banks) {
        const bankBal = await calculateOpeningBalance(bank, nextDay, bank.department?._id); // Passing Department ID
        totalBalance += bankBal;

        // Get department abbreviation from the bank's department
        const deptName = bank.department?.name || '';
        const deptAbbr = deptName.substring(0, 3).toUpperCase();

        // Check if bank name already contains department abbreviation to avoid duplicates
        // e.g., "ALF (MED)" already has "(MED)" so don't add it again
        let displayName = bank.bankName;
        if (deptAbbr && !bank.bankName.includes(`(${deptAbbr})`)) {
            displayName = `${bank.bankName} (${deptAbbr})`;
        }

        bankBalances.push({
            bankId: bank._id,
            bankName: bank.bankName,
            bankType: bank.bankType,
            department: deptName,
            deptAbbr: deptAbbr,
            displayName: displayName,
            balance: bankBal
        });
    }

    res.status(200).json({
        success: true,
        banks: bankBalances,
        totalBalance,
        bankCount: banks.length
    });
});

// @desc    Get Opening Balance for Bank Summary (multiple banks)
// @route   GET /api/v1/reports/bank-ledger/summary-opening-balance
// @access  Private
// Uses same formula approach as Zakat - aggregate all transactions before startDate
exports.getSummaryOpeningBalance = asyncHandler(async (req, res) => {
    const { startDate, branch, bankIds } = req.query;

    if (!startDate) {
        return res.status(400).json({ success: false, message: 'Please provide startDate' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    // Determine target Bank IDs and Names
    let targetBankIds = [];
    let targetBankNames = [];

    if (bankIds) {
        targetBankIds = bankIds.split(',');
    } else if (branch) {
        // If no specific banks selected but branch is, get all banks for this branch
        const banks = await Bank.find({ branch }).select('_id bankName').lean();
        targetBankIds = banks.map(b => b._id.toString());
        targetBankNames = banks.map(b => b.bankName);
    } else {
        // Fallback: If no branch/bank filter (rare for summary), might be hazardous. 
        // But let's assume filtering by at least branch is standard. 
        // If strictly required, we'd fetch ALL banks.
    }

    // Populate names if we only had IDs (for BankTransaction/Transfer string matching)
    if (targetBankIds.length > 0 && targetBankNames.length === 0) {
        const banks = await Bank.find({ _id: { $in: targetBankIds } }).select('bankName').lean();
        targetBankNames = banks.map(b => b.bankName);
    }

    // 1. Daily Cash (Batch Transfers) - BEFORE Start Date
    const dcMatchFilter = {
        mode: 'Bank',
        isVerified: true,
        bank: { $in: targetBankIds }
    };
    if (branch) dcMatchFilter.branch = branch;

    const dcEntries = await DailyCash.aggregate([
        { $match: dcMatchFilter },
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

    let dcTotal = 0;
    dcEntries.forEach(item => {
        // MATCH FRONTEND: Use totalAmount directly
        let amount = item.totalAmount || 0;
        // User Request: If Deduction (Verified Batch), show Net Amount (matching Ledger logic)
        const deductionRate = parseFloat(item.deductedAmount) || 0;
        if (item.isDeduction || deductionRate > 0) {
            const deductionVal = (amount * deductionRate) / 100;
            amount = Math.round(amount - deductionVal);
        }
        dcTotal += amount;
    });

    // 2. Bank Transactions (Withdrawals/Deposits) - BEFORE Start Date
    // FIX: Use Aggregation to calculate Opening Balance respecting 'chequeDate' as priority
    const btPipeline = [
        {
            $match: {
                $or: [
                    { bank: { $in: targetBankIds } },
                    { bankName: { $in: targetBankNames } }
                ]
            }
        }
    ];

    // Add Branch Filter if exists
    if (branch) {
        btPipeline[0].$match.branch = branch;
    }

    // Add Logic to determine Effective Date and Filter
    // effectiveDate = chequeDate if exists, else date
    btPipeline.push({
        $addFields: {
            effectiveDate: { $ifNull: [{ $toDate: "$chequeDate" }, "$date"] },
            // Normalize types for safer conditional logic
            normType: { $toLower: { $ifNull: ["$type", ""] } },
            normTransType: { $toLower: { $ifNull: ["$transactionType", ""] } }
        }
    });

    btPipeline.push({
        $match: {
            effectiveDate: { $lt: start }
        }
    });

    // Group and Sum
    btPipeline.push({
        $group: {
            _id: null,
            totalAmount: {
                $sum: {
                    $cond: [
                        {
                            $or: [
                                { $in: ["$normType", ["deposit", "received"]] },
                                { $in: ["$normTransType", ["deposit", "received"]] }
                            ]
                        },
                        "$amount",                  // If Deposit: Add Amount
                        { $multiply: ["$amount", -1] } // Else (Withdrawal): Subtract Amount
                    ]
                }
            }
        }
    });

    const btResult = await BankTransaction.aggregate(btPipeline);
    const btTotal = btResult.length > 0 ? btResult[0].totalAmount : 0;

    // 3. Bank Transfers - REMOVED separate aggregation
    // Since we now include bank_transfer entries in the BankTransaction Step (above),
    // calculating them again from the BankTransfer model would cause double counting.
    // Also, relying on BankTransaction ensures we account for "Orphan" transfer transactions 
    // that might show up in the table but not in the BankTransfer collection.

    const btbTotal = 0; // Effectively unused now

    // Final Aggregation
    const openingBalance = dcTotal + btTotal; // Removed btbTotal

    res.status(200).json({
        success: true,
        openingBalance: openingBalance,
        debug: {
            dc: dcTotal,
            bt: btTotal
        }
    });
});

// Helper function to calculate opening balance - defined above at line 226
