const mongoose = require('mongoose');

const cashTransactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    default: Date.now
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: ['receipt', 'payment']
  },
  refType: {
    type: String,
    required: [true, 'Reference type is required'],
    enum: ['sale', 'sale_return', 'purchase', 'purchase_return', 'manual']
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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
cashTransactionSchema.index({ date: -1 });
cashTransactionSchema.index({ type: 1, date: -1 });
cashTransactionSchema.index({ refType: 1, refId: 1 });

// Static method to create cash transaction and corresponding ledger entries
cashTransactionSchema.statics.createWithLedger = async function(transactionData, session) {
  const transaction = new this(transactionData);
  
  // Create ledger entry for cash account
  const ledgerEntry = {
    ledgerId: null, // Will be set to cash ledger ID
    date: transaction.date,
    debit: transaction.type === 'payment' ? transaction.amount : 0,
    credit: transaction.type === 'receipt' ? transaction.amount : 0,
    narration: transaction.narration,
    refType: `cash_${transaction.type}`,
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

module.exports = mongoose.model('CashTransaction', cashTransactionSchema);
