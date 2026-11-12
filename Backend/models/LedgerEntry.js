const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  ledgerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    required: [true, 'Ledger reference is required']
  },
  date: {
    type: Date,
    required: [true, 'Entry date is required'],
    default: Date.now
  },
  debit: {
    type: Number,
    required: [true, 'Debit amount is required'],
    min: [0, 'Debit amount cannot be negative'],
    default: 0
  },
  credit: {
    type: Number,
    required: [true, 'Credit amount is required'],
    min: [0, 'Credit amount cannot be negative'],
    default: 0
  },
  narration: {
    type: String,
    required: [true, 'Narration is required'],
    trim: true,
    maxlength: [200, 'Narration cannot exceed 200 characters']
  },
  refType: {
    type: String,
    required: [true, 'Reference type is required'],
    enum: ['sale', 'sale_return', 'purchase', 'purchase_return', 'cash_receipt', 'cash_payment', 'bank_deposit', 'bank_withdrawal', 'journal']
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Reference ID is required']
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

// Validation: Either debit or credit must be zero (not both)
// Note: Using async function to avoid next parameter issues
ledgerEntrySchema.pre('save', async function() {
  // Validate that both debit and credit are not positive
  if (this.debit > 0 && this.credit > 0) {
    throw new Error('Both debit and credit cannot be positive in the same entry');
  }
  // Allow both to be 0 for now (can be adjusted later if needed)
  // if (this.debit === 0 && this.credit === 0) {
  //   throw new Error('Either debit or credit must be positive');
  // }
});

// Indexes for faster queries
ledgerEntrySchema.index({ ledgerId: 1, date: -1 });
ledgerEntrySchema.index({ refType: 1, refId: 1 });
ledgerEntrySchema.index({ date: -1 });

// Static method to create double entry
ledgerEntrySchema.statics.createDoubleEntry = async function(entries, session) {
  const ledgerEntries = [];
  
  for (const entry of entries) {
    const ledgerEntry = new this(entry);
    ledgerEntries.push(ledgerEntry);
  }
  
  if (session) {
    return await this.insertMany(ledgerEntries, { session });
  } else {
    return await this.insertMany(ledgerEntries);
  }
};

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
