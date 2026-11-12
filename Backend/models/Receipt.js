const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  receiptNo: {
    type: String,
    unique: true,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  party: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  paymentMode: {
    type: String,
    required: true,
    enum: ['cash', 'bank', 'cheque', 'card', 'upi', 'other']
  },
  paymentDetails: {
    referenceNo: String,
    bankName: String,
    chequeNo: String,
    cardLast4: String,
    upiId: String
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Amount must be greater than 0']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  status: {
    type: String,
    enum: ['draft', 'completed', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Generate receipt number before saving
receiptSchema.pre('save', async function(next) {
  if (!this.isNew || this.receiptNo) return next();
  
  try {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.receiptNo = `RCPT-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    next();
  } catch (error) {
    next(error);
  }
});

// Update party balance after receipt
receiptSchema.post('save', async function(doc) {
  if (doc.status === 'completed') {
    const Party = mongoose.model('Party');
    const party = await Party.findById(doc.party);
    if (party) {
      await party.updateBalance(doc.amount, 'add');
    }
  }
});

// Indexes
receiptSchema.index({ date: -1 });
receiptSchema.index({ party: 1 });
receiptSchema.index({ paymentMode: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Receipt', receiptSchema);
