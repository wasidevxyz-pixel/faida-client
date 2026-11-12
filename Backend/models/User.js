const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters'],
    index: true // Performance: Indexed for fast login search by name
  },
  email: {
    type: String,
    required: [true, 'Please provide a login id'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 2,
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'sales', 'accounts'],
    default: 'sales'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  aiEnabled: {
    type: Boolean,
    default: false
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    fontFamily: {
      type: String,
      enum: ['times-new-roman', 'georgia', 'segoe-ui', 'arial'],
      default: 'times-new-roman'
    }
  },
  groupId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Group'
  },
  branch: {
    type: [String],
    default: []
  },
  department: {
    type: String,
    default: ''
  },
  zakat: {
    type: String,
    default: ''
  },
  userType: {
    type: String,
    default: ''
  },
  saleDeleteLimit: {
    type: String,
    default: ''
  },
  permissions: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  profilePicture: {
    type: String,
    default: ''
  },
  allowedWHCustomerCategories: {
    type: [mongoose.Schema.ObjectId],
    ref: 'WHCustomerCategory',
    default: []
  },
  allowedWHItemCategories: {
    type: [mongoose.Schema.ObjectId],
    ref: 'WHItemCategory',
    default: []
  },
  allowedItemCategories: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Category',
    default: []
  }
});

// Encrypt password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return; // Early return for async hooks
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
