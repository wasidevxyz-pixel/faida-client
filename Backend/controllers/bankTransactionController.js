const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const BankTransaction = require('../models/BankTransaction');
const Bank = require('../models/Bank');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');
const Store = require('../models/Store');

// @desc    Get all bank transactions
// @route   GET /api/v1/bank-transactions
// @access  Private (accounts access)
exports.getBankTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  let limit = parseInt(req.query.limit);
  if (isNaN(limit)) {
    limit = 10;
  }
  // FIX: If limit is 0, we want ALL documents. Mongoose might treat limit(0) as no limit, but explicit helps.
  // Also handle skip. If limit is 0 (all), skip should probably be ignored or 0.
  if (limit === 0) {
    // Set to a very large number effectively means "All"
    limit = 10000000;
  }

  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  if (req.query.bankName) {
    query.bankName = req.query.bankName;
  }

  if (req.query.branch) {
    const branchInput = req.query.branch;
    
    // Robust Branch Filter: Match Name OR ID (handles branch name format mismatches)
    let branchIds = [branchInput]; // Start with the input itself
    
    // Try to resolve to Store to get both name and ID
    const store = await Store.findOne({
      $or: [
        { name: branchInput }, 
        { _id: branchInput && branchInput.match(/^[0-9a-fA-F]{24}$/) ? branchInput : null }
      ]
    }).lean();
    
    if (store) {
      branchIds = [store.name, store._id.toString()];
    }
    
    // Create query that matches either name or ID
    query.branch = { $in: branchIds };
  }

  // Apply branch-level restriction to respect user access permissions
  const { applyBranchFilter } = require('../middleware/auth');
  query = await applyBranchFilter(req, query, BankTransaction);

  if (req.query.department) {
    query.department = req.query.department;
  }

  if (req.query.type) {
    let transactionType = req.query.type;
    if (transactionType === 'received') transactionType = 'deposit';
    if (transactionType === 'paid') transactionType = 'withdrawal';
    query.type = transactionType;
  }

  // Support for excluding specific refType (e.g., exclude bank_transfer from Bank Payments screen)
  if (req.query.excludeRefType && !req.query.refType) {
    query.refType = { $ne: req.query.excludeRefType };
    console.log('🔍 EXCLUDING refType:', req.query.excludeRefType);
  } else if (req.query.refType) {
    query.refType = req.query.refType;
  }

  console.log('📊 Final Query:', JSON.stringify(query, null, 2));

  if (req.query.partyId) {
    query.partyId = req.query.partyId;
  }

  // Global Search filter (Cheque No / Invoice No, Remarks / Narration, Bank Name, Branch, Amount)
  if (req.query.search) {
    const rawSearch = req.query.search.trim();
    const cleanSearch = rawSearch.replace(/,/g, '');
    const searchRegex = new RegExp(cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const numericSearch = parseFloat(cleanSearch);

    const searchConditions = [
      { invoiceNo: searchRegex },
      { narration: searchRegex },
      { bankName: searchRegex },
      { branch: searchRegex }
    ];

    if (!isNaN(numericSearch) && numericSearch > 0) {
      searchConditions.push({ amount: numericSearch });
    }

    if (query.$or) {
      query = {
        $and: [
          query,
          { $or: searchConditions }
        ]
      };
    } else {
      query.$or = searchConditions;
    }
  }

  if (req.query.startDate || req.query.endDate) {
    if (req.query.dateFilterType === 'clearance') {
        query.isVerified = true;
        query.clearedAt = {};
        if (req.query.startDate) {
          const s = new Date(req.query.startDate);
          s.setHours(0, 0, 0, 0);
          query.clearedAt.$gte = s;
        }
        if (req.query.endDate) {
          const e = new Date(req.query.endDate);
          e.setHours(23, 59, 59, 999);
          query.clearedAt.$lte = e;
        }
    } else if (req.query.dateFilterType === 'batch_transfer') {
        query.isVerified = true;
        query.verifiedDate = {};
        if (req.query.startDate) {
          const s = new Date(req.query.startDate);
          s.setHours(0, 0, 0, 0);
          query.verifiedDate.$gte = s;
        }
        if (req.query.endDate) {
          const e = new Date(req.query.endDate);
          e.setHours(23, 59, 59, 999);
          query.verifiedDate.$lte = e;
        }
    } else if (req.query.dateFilterType === 'cheque' || req.query.dateFilterType === 'cheque_date') {
        const start = req.query.startDate ? new Date(req.query.startDate) : new Date(0);
        start.setHours(0, 0, 0, 0);
        const end = req.query.endDate ? new Date(req.query.endDate) : new Date(8640000000000000);
        end.setHours(23, 59, 59, 999);
        const chequeOrConditions = [
          { chequeDate: { $gte: start, $lte: end } },
          {
            $and: [
              { $or: [{ chequeDate: null }, { chequeDate: { $exists: false } }] },
              { date: { $gte: start, $lte: end } }
            ]
          }
        ];
        if (query.$or) {
          query = {
            $and: [
              query,
              { $or: chequeOrConditions }
            ]
          };
        } else {
          query.$or = chequeOrConditions;
        }
        delete query.date;
        delete query.chequeDate;
    } else {
        query.date = {};
        if (req.query.startDate) {
          const s = new Date(req.query.startDate);
          s.setHours(0, 0, 0, 0);
          query.date.$gte = s;
        }
        if (req.query.endDate) {
          const e = new Date(req.query.endDate);
          e.setHours(23, 59, 59, 999);
          query.date.$lte = e;
        }
    }
  }

  // Cheque Date Range OR Effective Date Logic
  if (req.query.useEffectiveDate === 'true' && (req.query.startChqDate || req.query.endChqDate)) {
    // Hybrid Filter: Match if (ChequeDate in Range) OR (ChequeDate Missing AND Date in Range)
    const orConditions = [];
    const start = req.query.startChqDate ? new Date(req.query.startChqDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = req.query.endChqDate ? new Date(req.query.endChqDate) : new Date(8640000000000000);
    end.setHours(23, 59, 59, 999);

    // Condition 1: ChequeDate exists and is in range
    orConditions.push({
      chequeDate: { $gte: start, $lte: end }
    });

    // Condition 2: ChequeDate does NOT exist (null or undefined), and Date is in range
    orConditions.push({
      $and: [
        { $or: [{ chequeDate: null }, { chequeDate: { $exists: false } }] },
        { date: { $gte: start, $lte: end } }
      ]
    });

    if (query.$or) {
      query = {
        $and: [
          query,
          { $or: orConditions }
        ]
      };
    } else {
      query.$or = orConditions;
    }

    // Clear standard date filters to avoid conflicts if they were set above
    delete query.date;
    delete query.chequeDate;

  } else if (req.query.startChqDate || req.query.endChqDate) {
    // Standard strict Cheque Date filter
    query.chequeDate = {};
    if (req.query.startChqDate) {
      const s = new Date(req.query.startChqDate);
      s.setHours(0, 0, 0, 0);
      query.chequeDate.$gte = s;
    }
    if (req.query.endChqDate) {
      const e = new Date(req.query.endChqDate);
      e.setHours(23, 59, 59, 999);
      query.chequeDate.$lte = e;
    }
  }

  // Invoice Date Range
  if (req.query.startInvDate || req.query.endInvDate) {
    query.invoiceDate = {};
    if (req.query.startInvDate) query.invoiceDate.$gte = new Date(req.query.startInvDate + 'T00:00:00.000Z');
    if (req.query.endInvDate) {
      query.invoiceDate.$lte = new Date(req.query.endInvDate + 'T23:59:59.999Z');
    }
  }

  const transactions = await BankTransaction.find(query)
    .populate('partyId', 'name email phone')
    .populate('createdBy', 'name')
    .populate('department', 'name')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  const total = await BankTransaction.countDocuments(query);

  res.status(200).json({
    success: true,
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      prev: page > 1 ? { page: page - 1 } : null,
      next: page < Math.ceil(total / limit) ? { page: page + 1 } : null
    }
  });
});

// @desc    Get single bank transaction
// @route   GET /api/v1/bank-transactions/:id
// @access  Private (accounts access)
exports.getBankTransaction = asyncHandler(async (req, res) => {
  const transaction = await BankTransaction.findById(req.params.id)
    .populate('partyId', 'name email phone address')
    .populate('createdBy', 'name');

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Bank transaction not found'
    });
  }

  res.status(200).json({
    success: true,
    data: transaction
  });
});

// @desc    Create bank transaction
// @route   POST /api/v1/bank-transactions
// @access  Private (accounts access)
// @desc    Create bank transaction
// @route   POST /api/v1/bank-transactions
// @access  Private (accounts access)
exports.createBankTransaction = asyncHandler(async (req, res) => {
  try {
    // Frontend Payload: { transactionType, chequeDate, branch, department, bank, amount, remarks, invoiceNo, invoiceDate }
    let {
      bank, // This is the ID
      transactionType,
      amount,
      remarks,
      chequeDate,
      branch,
      department,
      invoiceNo,
      invoiceDate
    } = req.body;

    // Sanitize ObjectId fields
    if (department === '') department = null;
    if (req.body.partyId === '') req.body.partyId = null;

    // Validate Cheque Date Year (prevent erroneous dates like 0002 or 0026)
    if (chequeDate) {
      const chqYear = new Date(chequeDate).getFullYear();
      if (isNaN(chqYear) || chqYear < 2020 || chqYear > 2040) {
        return res.status(400).json({
          success: false,
          message: `Invalid Cheque Date (${chequeDate}): Year must be between 2020 and 2040.`
        });
      }
    }

    // 1. Resolve Bank Details to get Name
    const bankDoc = await Bank.findById(bank);
    if (!bankDoc) {
      throw new Error('Invalid Bank ID selected');
    }
    const bankName = bankDoc.bankName;
    const bankAccount = bankDoc.accountNumber || 'N/A'; // Fetch or default

    // 2. Map Fields
    // 'received' = 'deposit' (Money coming IN to bank)
    // 'paid' = 'withdrawal' (Money going OUT of bank)
    const type = (transactionType === 'received') ? 'deposit' : 'withdrawal';
    const narration = remarks || `Bank ${type} - Invoice ${invoiceNo || 'N/A'}`;
    const date = req.body.date ? new Date(req.body.date) : new Date();

    // 3. Get or create bank ledger
    const bankLedger = await Ledger.findOne({
      ledgerType: 'bank',
      ledgerName: bankName
    });

    if (!bankLedger) {
      // Create bank ledger if it doesn't exist
      const newBankLedger = new Ledger({
        ledgerName: bankName,
        ledgerType: 'bank',
        openingBalance: 0,
        balanceType: 'debit',
        currentBalance: 0,
        createdBy: req.user.id
      });
      await newBankLedger.save();
    }

    const ledger = bankLedger || await Ledger.findOne({ ledgerName: bankName });

    // 4. Create bank transaction
    // Schema expects: bankName, bankAccount, type, refType, refId, amount, narration
    const transaction = new BankTransaction({
      bankName,
      bankAccount,
      date: date,
      type,
      refType: 'manual', // Default for manual entry
      refId: new mongoose.Types.ObjectId(), // Self-reference or explicit new ID? Schema needs ObjectId. Let's create one.
      amount,
      narration,
      partyId: req.body.partyId || null, // Optional
      chequeDate, // Store extra fields if schema allows, otherwise put in narration
      invoiceNo,
      invoiceDate,
      branch,
      department,
      createdBy: req.user.id
    });

    // Note: If schema excludes branch/dept/invoices, they are lost unless we update schema.
    // Assuming for now the goal is just to SAVE successfully.

    await transaction.save();

    // 5. Create ledger entry for bank account
    const ledgerEntry = new LedgerEntry({
      ledgerId: ledger._id,
      date: transaction.date,
      debit: type === 'deposit' ? amount : 0,
      credit: type === 'withdrawal' ? amount : 0,
      narration,
      refType: `bank_${type}`,
      refId: transaction._id,
      createdBy: req.user.id
    });

    await ledgerEntry.save();

    // 6. Update bank ledger balance
    if (type === 'withdrawal') {
      ledger.currentBalance -= amount; // Paid = Credit Bank = Decrease
    } else {
      ledger.currentBalance += amount; // Received = Debit Bank = Increase
    }
    await ledger.save();

    res.status(201).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error('Bank transaction creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during bank transaction creation'
    });
  }
});

// @desc    Update bank transaction
// @route   PUT /api/v1/bank-transactions/:id
// @access  Private (admin, manager)
exports.updateBankTransaction = asyncHandler(async (req, res) => {
  try {
    const transaction = await BankTransaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Bank transaction not found'
      });
    }

    const oldAmount = transaction.amount;
    const oldType = transaction.type;
    let {
      amount,
      type,
      narration,
      partyId,
      transactionType,
      remarks,
      invoiceNo,
      invoiceDate,
      chequeDate,
      branch,
      department,
      bank // Add bank to the initial destructuring
    } = req.body;

    // Sanitize ObjectId fields
    if (department === '') department = null;
    if (partyId === '') partyId = null;

    // Validate Cheque Date Year (prevent erroneous dates like 0002 or 0026)
    if (chequeDate) {
      const chqYear = new Date(chequeDate).getFullYear();
      if (isNaN(chqYear) || chqYear < 2020 || chqYear > 2040) {
        return res.status(400).json({
          success: false,
          message: `Invalid Cheque Date (${chequeDate}): Year must be between 2020 and 2040.`
        });
      }
    }

    // Map frontend fields if backend native fields are missing
    if (!type && transactionType) {
      type = (transactionType === 'received') ? 'deposit' : 'withdrawal';
    }
    if (!narration && remarks) {
      narration = remarks;
    }

    // Fix: If bank ID provided (changing bank), resolve new Name/Account
    let updateFields = {
      amount,
      type,
      narration,
      partyId,
      invoiceNo,
      invoiceDate,
      chequeDate,
      branch,
      department
    };

    // If changing bank, we must update bankName and bankAccount
    if (bank) {
      const bankDoc = await Bank.findById(bank);
      if (bankDoc) {
        updateFields.bankName = bankDoc.bankName;
        updateFields.bankAccount = bankDoc.accountNumber || 'N/A';
      }
    }

    // Fix: Ensure 'date' field (used for sorting) matches chequeDate if provided
    if (chequeDate) {
      updateFields.date = chequeDate;
    }

    // Update transaction
    const updatedTransaction = await BankTransaction.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { returnDocument: 'after', runValidators: true }
    );

    // Update corresponding ledger entry
    const ledgerEntry = await LedgerEntry.findOne({
      refType: `bank_${oldType}`,
      refId: transaction._id
    });

    if (ledgerEntry) {
      // Reverse old entry
      const bankLedger = await Ledger.findById(ledgerEntry.ledgerId);

      if (bankLedger) {
        if (oldType === 'withdrawal') {
          bankLedger.currentBalance -= oldAmount;
        } else {
          bankLedger.currentBalance += oldAmount;
        }

        // Apply new entry
        if (type === 'withdrawal') {
          bankLedger.currentBalance += amount;
          ledgerEntry.debit = amount;
          ledgerEntry.credit = 0;
        } else {
          bankLedger.currentBalance -= amount;
          ledgerEntry.debit = 0;
          ledgerEntry.credit = amount;
        }

        await bankLedger.save();
      } else {
        console.warn(`Bank Ledger not found for ID: ${ledgerEntry.ledgerId} during Transaction Update`);
      }

      ledgerEntry.narration = narration;
      ledgerEntry.refType = `bank_${type}`;
      await ledgerEntry.save();
    }

    const populatedTransaction = await BankTransaction.findById(updatedTransaction._id)
      .populate('partyId', 'name email phone')
      .populate('createdBy', 'name');

    res.status(200).json({
      success: true,
      data: populatedTransaction
    });

  } catch (error) {
    console.error('Bank transaction update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during bank transaction update'
    });
  }
});

// @desc    Delete bank transaction
// @route   DELETE /api/v1/bank-transactions/:id
// @access  Private (admin only)
exports.deleteBankTransaction = asyncHandler(async (req, res) => {
  try {
    const transaction = await BankTransaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Bank transaction not found'
      });
    }

    // Update bank ledger balance
    const ledgerEntry = await LedgerEntry.findOne({
      refType: `bank_${transaction.type}`,
      refId: transaction._id
    });

    if (ledgerEntry) {
      const bankLedger = await Ledger.findById(ledgerEntry.ledgerId);

      if (bankLedger) {
        // Reverse the transaction effect
        // Withdrawal (was -) -> Now +
        // Deposit (was +) -> Now -
        if (transaction.type === 'withdrawal') {
          bankLedger.currentBalance += transaction.amount;
        } else {
          bankLedger.currentBalance -= transaction.amount;
        }
        await bankLedger.save();
      } else {
        console.warn(`Bank Transaction Delete: Ledger ${ledgerEntry.ledgerId} not found for entry ${ledgerEntry._id}`);
      }

      // Delete ledger entry
      await LedgerEntry.findByIdAndDelete(ledgerEntry._id);
    }

    // Delete transaction
    await BankTransaction.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Bank transaction deleted successfully'
    });

  } catch (error) {
    console.error('Bank transaction deletion error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during bank transaction deletion'
    });
  }
});

// @desc    Get bank book summary
// @route   GET /api/v1/bank-transactions/summary
// @access  Private (accounts access)
exports.getBankBookSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate, bankName, branch } = req.query;

  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }

  // Build bank filter
  let bankFilter = { ...dateFilter };
  if (bankName) {
    bankFilter.bankName = bankName;
  }
  if (branch) {
    bankFilter.branch = branch;
  }

  // Get bank ledgers
  const bankLedgers = await Ledger.find({ ledgerType: 'bank' });
  const bankBalances = bankLedgers.reduce((acc, ledger) => {
    acc[ledger.ledgerName] = ledger.currentBalance;
    return acc;
  }, {});

  // Get transaction summary
  const summary = await BankTransaction.aggregate([
    { $match: bankFilter },
    {
      $group: {
        _id: { bankName: '$bankName', type: '$type' },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get daily totals
  const dailyTotals = await BankTransaction.aggregate([
    { $match: bankFilter },
    {
      $group: {
        _id: {
          bankName: '$bankName',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
        },
        deposits: {
          $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] }
        },
        withdrawals: {
          $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] }
        },
        net: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'deposit'] },
              '$amount',
              { $multiply: ['$amount', -1] }
            ]
          }
        }
      }
    },
    { $sort: { '_id.date': 1, '_id.bankName': 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      bankBalances,
      summary: summary.reduce((acc, item) => {
        const key = `${item._id.bankName}_${item._id.type}`;
        acc[key] = {
          totalAmount: item.totalAmount,
          count: item.count
        };
        return acc;
      }, {}),
      dailyTotals
    }
  });
});

// @desc    Get bank list
// @route   GET /api/v1/bank-transactions/banks
// @access  Private (accounts access)
exports.getBankList = asyncHandler(async (req, res) => {
  const banks = await BankTransaction.aggregate([
    {
      $group: {
        _id: '$bankName',
        totalTransactions: { $sum: 1 },
        totalDeposits: {
          $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] }
        },
        totalWithdrawals: {
          $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: banks
  });
});

// @desc    Bulk Verify Bank Transactions
// @route   PUT /api/v1/bank-transactions/verify
// @access  Private (Manager+)
exports.verifyBankTransactions = asyncHandler(async (req, res) => {
  const { updates } = req.body; // Array of { id, isVerified }

  if (!updates || !Array.isArray(updates)) {
    return res.status(400).json({ success: false, message: 'Invalid updates payload' });
  }

  const bulkOps = updates.map(update => {
    const setObj = {
      isVerified: update.isVerified,
      ...(update.verifiedDate && { verifiedDate: new Date(update.verifiedDate) })
    };

    if (update.isVerified) {
      setObj.clearedAt = new Date();
    }

    return {
      updateOne: {
        filter: { _id: update.id },
        update: {
          $set: setObj,
          ...(!update.isVerified && { $unset: { clearedAt: 1 } })
        }
      }
    };
  });

  if (bulkOps.length > 0) {
    await BankTransaction.bulkWrite(bulkOps);
  }

  res.status(200).json({ success: true, message: 'Transactions updated successfully' });
});
