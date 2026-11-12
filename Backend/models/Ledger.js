const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  ledgerName: {
    type: String,
    required: [true, 'Please provide ledger name'],
    trim: true,
    unique: true
  },
  ledgerType: {
    type: String,
    required: [true, 'Please select ledger type'],
    enum: ['customer', 'supplier', 'cash', 'bank', 'sales', 'purchase', 'return', 'expense', 'income']
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'ledgerType'
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  balanceType: {
    type: String,
    enum: ['debit', 'credit'],
    default: 'debit'
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
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
ledgerSchema.index({ ledgerName: 'text' });
ledgerSchema.index({ ledgerType: 1 });
ledgerSchema.index({ refId: 1 });
ledgerSchema.index({ isActive: 1 });

// Update balance method
ledgerSchema.methods.updateBalance = async function(amount, type = 'debit') {
  if (type === 'debit') {
    this.currentBalance += amount;
  } else {
    this.currentBalance -= amount;
  }
  await this.save();
  return this;
};

module.exports = mongoose.model('Ledger', ledgerSchema);
