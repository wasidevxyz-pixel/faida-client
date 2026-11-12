const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: false // Optional - purchase returns can be created without a specific purchase invoice
  },
  returnInvoiceNo: {
    type: String,
    required: [true, 'Return invoice number is required'],
    unique: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: [true, 'Supplier is required']
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
    cost: {
      type: Number,
      required: [true, 'Cost is required'],
      min: [0, 'Cost cannot be negative']
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
    enum: ['cash', 'bank', 'adjust'],
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
purchaseReturnSchema.pre('save', async function () {
  this.updatedAt = Date.now();
});

// Index for faster queries
purchaseReturnSchema.index({ supplierId: 1, date: -1 });
purchaseReturnSchema.index({ status: 1 });

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
