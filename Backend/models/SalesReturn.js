const mongoose = require('mongoose');

const salesReturnSchema = new mongoose.Schema({
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: false
  },
  returnInvoiceNo: {
    type: String,
    required: [true, 'Return invoice number is required'],
    unique: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: [true, 'Customer is required']
  },
  date: {
    type: Date,
    required: [true, 'Return date is required'],
    default: Date.now
  },
  items: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Item is required']
    },
    returnQty: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [1, 'Return quantity must be at least 1']
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    taxPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    returnAmount: {
      type: Number,
      required: [true, 'Return amount is required'],
      min: [0, 'Return amount cannot be negative']
    }
  }],
  totalReturnAmount: {
    type: Number,
    required: [true, 'Total return amount is required'],
    min: [0, 'Total return amount cannot be negative']
  },
  returnMode: {
    type: String,
    enum: ['cash', 'bank', 'credit_note'],
    required: [true, 'Return mode is required']
  },
  status: {
    type: String,
    enum: ['draft', 'completed', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
salesReturnSchema.pre('save', async function () {
  this.updatedAt = Date.now();
});

// Index for faster queries
salesReturnSchema.index({ customerId: 1, date: -1 });
salesReturnSchema.index({ status: 1 });

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
