const mongoose = require('mongoose');
const purchaseItemSchema = require('./PurchaseItem');

const purchaseSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    unique: true,
    trim: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: [true, 'Please select a supplier']
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  dueDate: {
    type: Date
  },
  items: [purchaseItemSchema],
  subTotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  taxTotal: {
    type: Number,
    default: 0,
    min: [0, 'Tax total cannot be negative']
  },
  discountTotal: {
    type: Number,
    default: 0,
    min: [0, 'Discount total cannot be negative']
  },
  shippingCharges: {
    type: Number,
    default: 0,
    min: [0, 'Shipping charges cannot be negative']
  },
  otherCharges: {
    type: Number,
    default: 0,
    min: [0, 'Other charges cannot be negative']
  },
  roundOff: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    min: [0, 'Grand total cannot be negative']
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  balanceAmount: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'partial', 'unpaid'],
    default: 'unpaid'
  },
  paymentMode: {
    type: String,
    enum: ['cash', 'bank', 'credit'],
    required: [true, 'Please select payment mode']
  },
  paymentDetails: {
    referenceNo: String,
    bankName: String,
    paymentDate: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  status: {
    type: String,
    enum: ['draft', 'received', 'returned', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

console.log('✅ PURCHASE MODEL LOADED - UPDATED VERSION WITH NEXT() FIX');

// Pre-save hook - only set due date (invoice number is handled in controller)
purchaseSchema.pre('save', function () {
  // Set due date if not set (default to 30 days from now)
  // Note: Invoice number generation is handled in the controller to avoid write conflicts
  if (!this.dueDate) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    this.dueDate = dueDate;
  }
});

// Note: Post-save hook removed - inventory and balance updates are handled in the controller
// within the transaction to avoid write conflicts

// Indexes
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ date: -1 });
purchaseSchema.index({ paymentStatus: 1 });
purchaseSchema.index({ status: 1 });
purchaseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
