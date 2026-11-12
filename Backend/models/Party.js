const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  partyType: {
    type: String,
    required: [true, 'Please specify party type'],
    enum: ['customer', 'supplier', 'both']
  },
  code: {
    type: String,
    trim: true,
    unique: true
  },
  branch: {
    type: String, // Store Name
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please provide party name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  companyName: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  mobile: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      default: 'USA'
    }
  },
  taxNumber: {
    type: String,
    trim: true
  },
  panNumber: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PartyCategory'
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
  creditLimit: {
    type: Number,
    default: 0,
    min: [0, 'Credit limit cannot be negative']
  },
  paymentTerms: {
    type: Number, // in days
    default: 30
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate Party Code before saving (Robust)
partySchema.pre('save', async function () {
  // Only run on new documents
  if (!this.isNew) return;

  try {
    // 1. Check if provided code is already taken
    if (this.code) {
      const existing = await this.constructor.findOne({ code: this.code });
      if (!existing) {
        // Code is unique, proceed
        return;
      }
      // If code exists, fall through to auto-generation
    }

    const prefix = this.partyType === 'supplier' ? 'SUPP' : 'CUST';

    // Find latest code with this prefix
    const lastParty = await this.constructor.findOne({
      code: { $regex: new RegExp(`^${prefix}-\\d+$`) }
    }).sort({ code: -1 });

    let sequence = 1;

    if (lastParty && lastParty.code) {
      const parts = lastParty.code.split('-');
      if (parts.length > 1) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) sequence = num + 1;
      }
    }

    // Collision Check Loop
    let isUnique = false;
    while (!isUnique) {
      this.code = `${prefix}-${sequence.toString().padStart(3, '0')}`;

      const existing = await this.constructor.findOne({ code: this.code });
      if (existing) {
        sequence++;
      } else {
        isUnique = true;
      }
    }
  } catch (err) {
    throw err;
  }
});

// Update current balance
partySchema.methods.updateBalance = async function (amount, type = 'add') {
  if (type === 'add') {
    this.currentBalance += amount;
  } else if (type === 'subtract') {
    this.currentBalance -= amount;
  }

  await this.save();
  return this;
};

// Check credit limit (for customers)
partySchema.methods.checkCreditLimit = function (amount) {
  if (this.partyType === 'supplier') return true;
  return (this.currentBalance + amount) <= this.creditLimit;
};

// Virtual for full address
partySchema.virtual('fullAddress').get(function () {
  return `${this.address.street || ''}, ${this.address.city || ''} ${this.address.state || ''} ${this.address.postalCode || ''}`.trim();
});

// Indexes
partySchema.index({ name: 'text', companyName: 'text', email: 'text', phone: 'text' });
partySchema.index({ partyType: 1 });
partySchema.index({ isActive: 1 });
partySchema.index({ currentBalance: 1 });

module.exports = mongoose.model('Party', partySchema);
