const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseNo: {
    type: String,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['expense', 'receipt'],
    default: 'expense'
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  head: {
    type: String,
    required: [true, 'Please select expense head'],
    trim: true
  },
  subHead: {
    type: String,
    trim: true
  },
  category: { // Keeping for backward compatibility, but not required
    type: String,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Amount must be greater than 0']
  },
  paymentMode: {
    type: String,
    required: true,
    enum: ['cash', 'bank', 'cheque', 'card', 'upi', 'online'],
    default: 'cash'
  },
  cashAccount: {
    type: String,
    default: 'Cash in Hand (Shop)'
  },
  paymentDetails: {
    referenceNo: String,
    bankName: String,
    chequeNo: String,
    chequeDate: Date
  },
  description: {
    type: String,
    trim: true
  },
  attachment: {
    type: String, // URL to the uploaded file
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  notes: { // Can be used for Remarks
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: String,
    default: 'Shop'
  }
}, {
  timestamps: true
});

// Generate expense number before saving
expenseSchema.pre('save', async function () {
  if (!this.isNew || this.expenseNo) return;

  try {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `EXP-${year}${month}-`;

    // Find the last expense number for this month
    const lastExpense = await this.constructor
      .findOne({ expenseNo: new RegExp(`^${prefix}`) })
      .sort({ expenseNo: -1 })
      .select('expenseNo')
      .lean();

    let nextNumber = 1;
    if (lastExpense && lastExpense.expenseNo) {
      // Extract the number part from the last expense number
      const lastNumber = parseInt(lastExpense.expenseNo.split('-').pop());
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    this.expenseNo = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
});

// Indexes
expenseSchema.index({ date: -1 });
expenseSchema.index({ head: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
