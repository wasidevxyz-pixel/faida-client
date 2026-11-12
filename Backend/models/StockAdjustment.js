const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
  adjustmentNo: {
    type: String,
    unique: true,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  referenceNo: {
    type: String,
    trim: true
  },
  adjustmentType: {
    type: String,
    required: true,
    enum: ['addition', 'deduction', 'damage', 'expired', 'found', 'other']
  },
  items: [{
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'Quantity must be greater than 0']
    },
    currentStock: {
      type: Number,
      required: true
    },
    newStock: {
      type: Number,
      required: true
    },
    rate: {
      type: Number,
      required: true,
      min: [0, 'Rate cannot be negative']
    },
    total: {
      type: Number,
      required: true
    }
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    trim: true,
    required: [true, 'Please provide a reason for adjustment']
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['draft', 'approved', 'cancelled'],
    default: 'draft'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Generate adjustment number before saving
stockAdjustmentSchema.pre('save', async function(next) {
  if (!this.isNew || this.adjustmentNo) return next();
  
  try {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.adjustmentNo = `ADJ-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    next();
  } catch (error) {
    next(error);
  }
});

// Update item stock after approval
stockAdjustmentSchema.post('save', async function(doc) {
  if (doc.status === 'approved') {
    const Item = mongoose.model('Item');
    
    for (const item of doc.items) {
      await Item.findByIdAndUpdate(
        item.item,
        { $inc: { stockQty: item.quantity } }
      );
    }
  }
});

// Indexes
stockAdjustmentSchema.index({ date: -1 });
stockAdjustmentSchema.index({ adjustmentType: 1 });
stockAdjustmentSchema.index({ status: 1 });
stockAdjustmentSchema.index({ createdBy: 1 });

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
