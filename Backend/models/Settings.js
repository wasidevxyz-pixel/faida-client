const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone cannot exceed 20 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  website: {
    type: String,
    trim: true
  },
  taxType: {
    type: String,
    enum: ['gst', 'vat', 'none', 'other'],
    default: 'none'
  },
  taxNumber: {
    type: String,
    trim: true,
    maxlength: [50, 'Tax number cannot exceed 50 characters']
  },
  pan: {
    type: String,
    trim: true,
    maxlength: [20, 'PAN cannot exceed 20 characters']
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  postalCode: {
    type: String,
    trim: true
  },
  cgstRate: {
    type: Number,
    default: 0
  },
  sgstRate: {
    type: Number,
    default: 0
  },
  igstRate: {
    type: Number,
    default: 0
  },
  cessRate: {
    type: Number,
    default: 0
  },
  enableReverseCharge: {
    type: Boolean,
    default: false
  },
  invoicePrefix: {
    type: String,
    required: [true, 'Invoice prefix is required'],
    trim: true,
    maxlength: [10, 'Invoice prefix cannot exceed 10 characters'],
    default: 'INV'
  },
  saleReturnPrefix: {
    type: String,
    required: [true, 'Sale return prefix is required'],
    trim: true,
    maxlength: [10, 'Sale return prefix cannot exceed 10 characters'],
    default: 'SR'
  },
  purchasePrefix: {
    type: String,
    required: [true, 'Purchase prefix is required'],
    trim: true,
    maxlength: [10, 'Purchase prefix cannot exceed 10 characters'],
    default: 'PUR'
  },
  purchaseReturnPrefix: {
    type: String,
    required: [true, 'Purchase return prefix is required'],
    trim: true,
    maxlength: [10, 'Purchase return prefix cannot exceed 10 characters'],
    default: 'PR'
  },
  financialYear: {
    type: String,
    required: [true, 'Financial year is required'],
    trim: true,
    maxlength: [10, 'Financial year cannot exceed 10 characters'],
    default: new Date().getFullYear().toString()
  },
  financialYearStart: {
    type: Date,
    required: [true, 'Financial year start date is required'],
    default: () => new Date(new Date().getFullYear(), 3, 1) // April 1st by default
  },
  financialYearEnd: {
    type: Date,
    required: [true, 'Financial year end date is required'],
    default: () => new Date(new Date().getFullYear(), 2, 31) // March 31st by default
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    trim: true,
    maxlength: [10, 'Currency cannot exceed 10 characters'],
    default: 'USD'
  },
  currencySymbol: {
    type: String,
    required: [true, 'Currency symbol is required'],
    trim: true,
    maxlength: [5, 'Currency symbol cannot exceed 5 characters'],
    default: '$'
  },
  dateFormat: {
    type: String,
    enum: ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd-mm-yyyy'],
    default: 'dd/mm/yyyy'
  },
  timezone: {
    type: String,
    required: [true, 'Timezone is required'],
    trim: true,
    maxlength: [50, 'Timezone cannot exceed 50 characters'],
    default: 'UTC'
  },
  decimalPlaces: {
    type: Number,
    required: [true, 'Decimal places is required'],
    min: [0, 'Decimal places cannot be negative'],
    max: [4, 'Decimal places cannot exceed 4'],
    default: 2
  },
  logo: {
    type: String, // URL or file path
    trim: true
  },
  watermark: {
    type: String, // URL or file path
    trim: true
  },
  defaultTaxPercent: {
    type: Number,
    min: [0, 'Default tax percent cannot be negative'],
    max: [100, 'Default tax percent cannot exceed 100'],
    default: 0
  },
  enableInventory: {
    type: Boolean,
    default: true
  },
  enableMultiCurrency: {
    type: Boolean,
    default: false
  },
  enableBarcode: {
    type: Boolean,
    default: false
  },
  enableSerialNumber: {
    type: Boolean,
    default: false
  },
  enableBatchNumber: {
    type: Boolean,
    default: false
  },
  enableExpiryDate: {
    type: Boolean,
    default: false
  },
  lowStockThreshold: {
    type: Number,
    min: [0, 'Low stock threshold cannot be negative'],
    default: 10
  },
  backupEnabled: {
    type: Boolean,
    default: true
  },
  backupFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  backupRetentionDays: {
    type: Number,
    min: [1, 'Backup retention days must be at least 1'],
    default: 30
  },
  emailNotifications: {
    type: Boolean,
    default: false
  },
  smtpHost: {
    type: String,
    trim: true
  },
  smtpPort: {
    type: Number,
    min: [1, 'SMTP port must be at least 1'],
    max: [65535, 'SMTP port cannot exceed 65535']
  },
  smtpUser: {
    type: String,
    trim: true
  },
  smtpPassword: {
    type: String,
    trim: true
  },
  smtpSecure: {
    type: Boolean,
    default: false
  },
  // MongoDB Backup Configuration
  mongodbUri: {
    type: String,
    trim: true,
    default: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/FAIDA-CLIENT'
  },
  backupFolderPath: {
    type: String,
    trim: true,
    default: './backups'
  },
  mongoToolsPath: {
    type: String,
    trim: true,
    default: '' // Empty means use system PATH
  },
  lastBackupDate: {
    type: Date
  },
  autoBackupEnabled: {
    type: Boolean,
    default: true
  },
  autoBackupTime: {
    type: String,
    default: '02:00' // 2 AM daily backup
  },
  // ===== MEGA CLOUD BACKUP CONFIGURATION =====
  megaEnabled: {
    type: Boolean,
    default: false
  },
  megaEmail: {
    type: String,
    trim: true
  },
  megaPassword: {
    type: String,
    trim: true // Stored encrypted
  },
  megaBackupFolderName: {
    type: String,
    trim: true,
    default: 'BAS_Backups'
  },
  keepLocalBackupDays: {
    type: Number,
    min: [0, 'Keep local backup days cannot be negative'],
    default: 7, // Keep local backups for 7 days after upload
    description: 'Days to keep local backups after successful upload to Mega'
  },
  megaUploadEnabled: {
    type: Boolean,
    default: true,
    description: 'Auto-upload backups to Mega after compression'
  },
  lastMegaUploadDate: {
    type: Date
  },
  lastMegaUploadStatus: {
    type: String,
    enum: ['success', 'failed', 'pending', 'skipped'],
    default: 'pending'
  },
  lastMegaUploadError: {
    type: String,
    description: 'Last error message from Mega upload (if any)'
  },
  megaUploadStats: {
    totalUploaded: {
      type: Number,
      default: 0,
      description: 'Total number of backups uploaded to Mega'
    },
    totalUploadedSize: {
      type: Number,
      default: 0,
      description: 'Total size of backups uploaded (in bytes)'
    },
    lastUploadSize: {
      type: Number,
      description: 'Size of last uploaded backup (in bytes)'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  apiKey: {
    type: String,
    trim: true,
    index: true
  },
  apiSecret: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'settings'
});

// Update the updatedAt field on save
settingsSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

// Static method to get settings
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({});

  if (!settings) {
    // Create default settings if none exist
    settings = new this({
      companyName: 'Default Company',
      createdBy: '000000000000000000000000' // Default admin user
    });
    await settings.save();
  }

  return settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function (updateData, userId) {
  const settings = await this.getSettings();

  // Explicitly update new fields to ensure they are captured
  if (updateData.city !== undefined) settings.city = updateData.city;
  if (updateData.state !== undefined) settings.state = updateData.state;
  if (updateData.postalCode !== undefined) settings.postalCode = updateData.postalCode;
  if (updateData.pan !== undefined) settings.pan = updateData.pan;
  if (updateData.taxNumber !== undefined) settings.taxNumber = updateData.taxNumber;
  if (updateData.cgstRate !== undefined) settings.cgstRate = updateData.cgstRate;
  if (updateData.sgstRate !== undefined) settings.sgstRate = updateData.sgstRate;
  if (updateData.igstRate !== undefined) settings.igstRate = updateData.igstRate;
  if (updateData.cessRate !== undefined) settings.cessRate = updateData.cessRate;
  if (updateData.enableReverseCharge !== undefined) settings.enableReverseCharge = updateData.enableReverseCharge;

  Object.assign(settings, updateData);
  settings.updatedBy = userId;

  return await settings.save();
};

// Instance method to get next invoice number
settingsSchema.methods.getNextInvoiceNumber = async function (type = 'sale') {
  let prefix;

  switch (type) {
    case 'sale':
      prefix = this.invoicePrefix;
      break;
    case 'sale_return':
      prefix = this.saleReturnPrefix;
      break;
    case 'purchase':
      prefix = this.purchasePrefix;
      break;
    case 'purchase_return':
      prefix = this.purchaseReturnPrefix;
      break;
    default:
      prefix = this.invoicePrefix;
  }

  const year = this.financialYear;
  const baseNumber = `${prefix}/${year}/`;

  // Get the last invoice number for this type and year
  const Model = type === 'sale' ? require('./Sale') :
    type === 'sale_return' ? require('./SalesReturn') :
      type === 'purchase' ? require('./Purchase') :
        require('./PurchaseReturn');

  const lastRecord = await Model.findOne({
    [type === 'sale' ? 'invoiceNo' : 'returnInvoiceNo']: { $regex: `^${baseNumber}` }
  }).sort({ [type === 'sale' ? 'invoiceNo' : 'returnInvoiceNo']: -1 });

  let nextNumber = 1;

  if (lastRecord) {
    const lastInvoiceNo = type === 'sale' ? lastRecord.invoiceNo : lastRecord.returnInvoiceNo;
    const lastNumber = parseInt(lastInvoiceNo.split('/')[2]) || 0;
    nextNumber = lastNumber + 1;
  }

  return `${baseNumber}${nextNumber.toString().padStart(4, '0')}`;
};

module.exports = mongoose.model('Settings', settingsSchema);
