const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  bankAccount: {
    type: String,
    required: [true, 'Bank account is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    default: Date.now
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: ['deposit', 'withdrawal']
  },
  refType: {
    type: String,
    required: [true, 'Reference type is required'],
    enum: ['sale', 'sale_return', 'purchase', 'purchase_return', 'manual', 'bank_transfer']
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Reference ID is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  narration: {
    type: String,
    required: [true, 'Narration is required'],
    trim: true,
    maxlength: [200, 'Narration cannot exceed 200 characters']
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  // Added fields for extended functionality
  chequeDate: {
    type: Date,
    validate: {
      validator: function(val) {
        if (!val) return true;
        const y = new Date(val).getFullYear();
        return y >= 2020 && y <= 2040;
      },
      message: props => `Invalid Cheque Date year (${new Date(props.value).getFullYear()}). Year must be between 2020 and 2040.`
    }
  },
  invoiceNo: { type: String, trim: true },
  invoiceDate: { type: Date },
  branch: { type: String, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  isVerified: { type: Boolean, default: false }, // For Bank Reconciliation Status
  verifiedDate: { type: Date }, // Date when transaction was verified
  clearedAt: { type: Date }, // System date when the transaction was actually cleared

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
bankTransactionSchema.index({ bankName: 1, date: -1 });
bankTransactionSchema.index({ type: 1, date: -1 });
bankTransactionSchema.index({ refType: 1, refId: 1 });

// Static method to create bank transaction and corresponding ledger entries
bankTransactionSchema.statics.createWithLedger = async function (transactionData, session) {
  const transaction = new this(transactionData);

  // Create ledger entry for bank account
  const ledgerEntry = {
    ledgerId: null, // Will be set to bank ledger ID
    date: transaction.date,
    debit: transaction.type === 'deposit' ? transaction.amount : 0,
    credit: transaction.type === 'withdrawal' ? transaction.amount : 0,
    narration: transaction.narration,
    refType: `bank_${transaction.type}`,
    refId: transaction._id,
    createdBy: transaction.createdBy
  };

  if (session) {
    await transaction.save({ session });
    // Ledger entry will be created by the calling function with proper ledger ID
  } else {
    await transaction.save();
  }

  return transaction;
};

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
