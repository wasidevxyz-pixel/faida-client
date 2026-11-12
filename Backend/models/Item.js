const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide item name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  sku: {
    type: String,
    unique: true,
    trim: true,
    sparse: true
  },
  barcode: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  category: {
    type: String,
    required: [true, 'Please select a category']
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemClass'
  },
  subclass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubClass'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  purchasePrice: {
    type: Number,
    required: [true, 'Please provide purchase price'],
    min: [0, 'Price cannot be negative']
  },
  salePrice: {
    type: Number,
    required: [true, 'Please provide sale price'],
    min: [0, 'Price cannot be negative']
  },
  incentive: {
    type: Number,
    default: 0,
    min: [0, 'Incentive cannot be negative']
  },
  taxPercent: {
    type: Number,
    default: 0,
    min: [0, 'Tax percentage cannot be negative'],
    max: [100, 'Tax percentage cannot be more than 100']
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: [0, 'Discount percentage cannot be negative'],
    max: [100, 'Discount percentage cannot be more than 100']
  },
  stockQty: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Stock quantity cannot be negative']
  },
  minStockLevel: {
    type: Number,
    default: 0,
    min: [0, 'Minimum stock level cannot be negative']
  },
  unit: {
    type: String,
    required: [true, 'Please provide unit of measurement']
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
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

// Generate SKU before saving
// Generate SKU and Barcode before saving
itemSchema.pre('save', async function () {
  // Only run if new or modifying relevant fields
  if (!this.isNew && this.sku && this.barcode) return;

  try {
    // Generate SKU if missing
    if (!this.sku) {
      const lastItem = await this.constructor.findOne({}, {}, { sort: { 'createdAt': -1 } });
      let nextId = 1;

      if (lastItem && lastItem.sku && !isNaN(parseInt(lastItem.sku))) {
        // Continue sequence from last item, or start restart if logically appropriate?
        // User asked for "0001" format. If existing is "1001", next will be "1002".
        // If existing is "0001", next is "0002".
        nextId = parseInt(lastItem.sku) + 1;
      }
      // Format as 4-digit string (e.g. 0001)
      this.sku = nextId.toString().padStart(4, '0');
    }

    // Generate Barcode if missing (default to SKU)
    if (!this.barcode) {
      this.barcode = this.sku;
    }

  } catch (error) {
    console.error('Error generating SKU/Barcode:', error);
    // Fallback
    if (!this.sku) this.sku = Date.now().toString();
    if (!this.barcode) this.barcode = this.sku;
  }
});

// Update stock quantity
itemSchema.methods.updateStock = async function (quantity, type = 'in') {
  if (type === 'in') {
    this.stockQty += quantity;
  } else if (type === 'out') {
    if (this.stockQty < quantity) {
      throw new Error('Insufficient stock');
    }
    this.stockQty -= quantity;
  }

  await this.save();
  return this;
};

// Check stock availability
itemSchema.methods.checkStock = function (quantity) {
  return this.stockQty >= quantity;
};

// Virtual for item's current value
itemSchema.virtual('currentValue').get(function () {
  return this.stockQty * this.purchasePrice;
});

// Virtual for cost percentage (incentive/purchasePrice * 100)
itemSchema.virtual('costPercent').get(function () {
  if (!this.purchasePrice || this.purchasePrice === 0) return 0;
  return ((this.incentive || 0) / this.purchasePrice) * 100;
});

// Indexes for better query performance
itemSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
itemSchema.index({ category: 1 });
itemSchema.index({ company: 1 });
itemSchema.index({ class: 1 });
itemSchema.index({ subclass: 1 });
itemSchema.index({ supplier: 1 });
itemSchema.index({ isActive: 1 });
itemSchema.index({ stockQty: 1 });

module.exports = mongoose.model('Item', itemSchema);
