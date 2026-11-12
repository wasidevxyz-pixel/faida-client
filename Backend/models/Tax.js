const mongoose = require('mongoose');

const taxSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide tax name'],
    trim: true,
    unique: true,
    maxlength: [100, 'Tax name cannot exceed 100 characters']
  },
  rate: {
    type: Number,
    required: [true, 'Please provide tax rate'],
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100']
  },
  type: {
    type: String,
    required: [true, 'Please select tax type'],
    enum: ['sales', 'purchase', 'both'],
    default: 'both'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  taxNumber: {
    type: String,
    trim: true,
    maxlength: [50, 'Tax number cannot exceed 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  applicableFrom: {
    type: Date,
    required: [true, 'Applicable from date is required'],
    default: Date.now
  },
  applicableTo: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt field on save
taxSchema.pre('save', function() {
  this.updatedAt = Date.now();
  
  // Ensure only one default tax exists
  if (this.isDefault) {
    this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { isDefault: false },
      { multi: true }
    ).exec();
  }
});

// Index for faster queries
taxSchema.index({ rate: 1 });
taxSchema.index({ type: 1 });
taxSchema.index({ isActive: 1 });
taxSchema.index({ isDefault: 1 });

// Static method to get active taxes
taxSchema.statics.getActiveTaxes = async function(type = null) {
  let query = { isActive: true };
  if (type && type !== 'both') {
    query.type = { $in: [type, 'both'] };
  }
  return await this.find(query).sort({ name: 1 });
};

// Static method to get default tax
taxSchema.statics.getDefaultTax = async function() {
  return await this.findOne({ isActive: true, isDefault: true });
};

// Static method to get applicable taxes for date
taxSchema.statics.getApplicableTaxes = async function(date = new Date(), type = null) {
  let query = {
    isActive: true,
    applicableFrom: { $lte: date },
    $or: [
      { applicableTo: null },
      { applicableTo: { $gte: date } }
    ]
  };
  
  if (type && type !== 'both') {
    query.type = { $in: [type, 'both'] };
  }
  
  return await this.find(query).sort({ name: 1 });
};

// Instance method to check if tax is applicable for date
taxSchema.methods.isApplicableForDate = function(date = new Date()) {
  if (this.applicableFrom > date) return false;
  if (this.applicableTo && this.applicableTo < date) return false;
  return true;
};

// Instance method to calculate tax amount
taxSchema.methods.calculateTax = function(amount) {
  return (amount * this.rate) / 100;
};

module.exports = mongoose.model('Tax', taxSchema);
