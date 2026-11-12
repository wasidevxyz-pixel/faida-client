const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide unit name'],
    trim: true,
    unique: true,
    maxlength: [50, 'Unit name cannot exceed 50 characters']
  },
  shortName: {
    type: String,
    required: [true, 'Please provide short name'],
    trim: true,
    unique: true,
    maxlength: [10, 'Short name cannot exceed 10 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  baseUnit: {
    type: String,
    trim: true,
    maxlength: [50, 'Base unit cannot exceed 50 characters']
  },
  conversionFactor: {
    type: Number,
    default: 1,
    min: [0.01, 'Conversion factor must be at least 0.01']
  },
  isActive: {
    type: Boolean,
    default: true
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
unitSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Index for faster queries
unitSchema.index({ isActive: 1 });

// Static method to get active units
unitSchema.statics.getActiveUnits = async function() {
  return await this.find({ isActive: true }).sort({ name: 1 });
};

// Static method to get unit by name or short name
unitSchema.statics.findByNameOrShortName = async function(identifier) {
  return await this.findOne({
    $or: [
      { name: identifier },
      { shortName: identifier }
    ],
    isActive: true
  });
};

module.exports = mongoose.model('Unit', unitSchema);
