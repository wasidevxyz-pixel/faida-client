const mongoose = require('mongoose');

const stockLogSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Item reference is required']
  },
  date: {
    type: Date,
    required: [true, 'Log date is required'],
    default: Date.now
  },
  qty: {
    type: Number,
    required: [true, 'Quantity is required']
  },
  type: {
    type: String,
    required: [true, 'Log type is required'],
    enum: ['in', 'out']
  },
  refType: {
    type: String,
    required: [true, 'Reference type is required'],
    enum: ['sale', 'sale_return', 'purchase', 'purchase_return', 'adjustment']
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Reference ID is required']
  },
  previousQty: {
    type: Number,
    required: [true, 'Previous quantity is required']
  },
  newQty: {
    type: Number,
    required: [true, 'New quantity is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  notes: {
    type: String,
    maxlength: [200, 'Notes cannot exceed 200 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
stockLogSchema.index({ itemId: 1, date: -1 });
stockLogSchema.index({ refType: 1, refId: 1 });
stockLogSchema.index({ type: 1, date: -1 });

// Static method to create stock log
stockLogSchema.statics.createLog = async function(logData, session) {
  const stockLog = new this(logData);
  
  if (session) {
    await stockLog.save({ session });
  } else {
    await stockLog.save();
  }
  
  return stockLog;
};

// Static method to get stock movement summary for an item
stockLogSchema.statics.getMovementSummary = async function(itemId, startDate, endDate) {
  const matchCondition = { itemId };
  
  if (startDate || endDate) {
    matchCondition.date = {};
    if (startDate) matchCondition.date.$gte = startDate;
    if (endDate) matchCondition.date.$lte = endDate;
  }
  
  const summary = await this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$type',
        totalQty: { $sum: '$qty' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return summary;
};

module.exports = mongoose.model('StockLog', stockLogSchema);
