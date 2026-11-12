const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  referenceNo: {
    type: String,
    trim: true
  },
  referenceType: {
    type: String,
    enum: ['sale', 'purchase', 'payment', 'receipt', 'expense', 'income', 'journal', 'opening'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  entries: [{
    ledger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ledger',
      required: true
    },
    type: {
      type: String,
      enum: ['debit', 'credit'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative']
    },
    description: String
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative']
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ date: -1 });
transactionSchema.index({ referenceType: 1, referenceId: 1 });
transactionSchema.index({ 'entries.ledger': 1 });

// Update ledger balances after saving transaction
transactionSchema.post('save', async function (doc) {
  const Ledger = mongoose.model('Ledger');

  for (const entry of doc.entries) {
    await Ledger.findByIdAndUpdate(
      entry.ledger,
      {
        $inc: {
          currentBalance: entry.type === 'debit' ? entry.amount : -entry.amount
        }
      }
    );
  }
});

// Revert ledger balances if transaction is deleted
transactionSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  const Ledger = mongoose.model('Ledger');

  for (const entry of this.entries) {
    await Ledger.findByIdAndUpdate(
      entry.ledger,
      {
        $inc: {
          currentBalance: entry.type === 'debit' ? -entry.amount : entry.amount
        }
      }
    );
  }

  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
