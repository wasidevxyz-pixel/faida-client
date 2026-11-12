const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Common validation rules
const commonValidations = {
  // ID validation
  mongoId: param('id').isMongoId().withMessage('Invalid ID format'),

  // Date validation
  date: body('date').isISO8601().withMessage('Invalid date format'),
  optionalDate: body('date').optional().isISO8601().withMessage('Invalid date format'),

  // Amount validation
  amount: body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),

  // Email validation
  email: body('email').isEmail().withMessage('Invalid email format'),

  // Phone validation
  phone: body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),

  // Name validation
  name: body('name').trim().notEmpty().withMessage('Name is required'),

  // Pagination validation
  page: query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  limit: query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
};

// User validation rules
const userValidations = {
  create: [
    commonValidations.name,
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['admin', 'manager', 'sales', 'accounts']).withMessage('Invalid role')
  ],
  update: [
    commonValidations.mongoId,
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('role').optional().isIn(['admin', 'manager', 'sales', 'accounts']).withMessage('Invalid role')
  ]
};

// Item validation rules
const itemValidations = {
  create: [
    commonValidations.name,
    body('sku').optional().trim(),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('purchasePrice').isFloat({ min: 0 }).withMessage('Purchase price must be positive'),
    body('salePrice').isFloat({ min: 0 }).withMessage('Sale price must be positive'),
    body('taxPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax percent must be between 0 and 100'),
    body('stockQty').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative'),
    body('unit').optional().trim().notEmpty().withMessage('Unit cannot be empty')
  ],
  update: [
    commonValidations.mongoId,
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty'),
    body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
    body('purchasePrice').optional().isFloat({ min: 0 }).withMessage('Purchase price must be positive'),
    body('salePrice').optional().isFloat({ min: 0 }).withMessage('Sale price must be positive'),
    body('taxPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax percent must be between 0 and 100'),
    body('stockQty').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative')
  ]
};

// Party validation rules
const partyValidations = {
  create: [
    commonValidations.name,
    body('partyType').isIn(['customer', 'supplier', 'both']).withMessage('Invalid party type'),
    body('mobile').isMobilePhone('any').withMessage('Invalid mobile number'),
    body('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
    body('openingBalance').optional().isFloat().withMessage('Opening balance must be a number'),
    body('balanceType').optional().isIn(['Dr', 'Cr']).withMessage('Balance type must be Dr or Cr')
  ],
  update: [
    commonValidations.mongoId,
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('partyType').optional().isIn(['customer', 'supplier', 'both']).withMessage('Invalid party type'),
    body('mobile').optional().isMobilePhone('any').withMessage('Invalid mobile number'),
    body('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
    body('openingBalance').optional().isFloat().withMessage('Opening balance must be a number'),
    body('balanceType').optional().isIn(['Dr', 'Cr']).withMessage('Balance type must be Dr or Cr')
  ]
};

// Sale validation rules
const saleValidations = {
  create: [
    commonValidations.date,
    body('customerId').isMongoId().withMessage('Invalid customer ID'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.itemId').isMongoId().withMessage('Invalid item ID'),
    body('items.*.qty').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be positive'),
    body('items.*.taxPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax percent must be between 0 and 100'),
    body('items.*.discount').optional().isFloat({ min: 0 }).withMessage('Discount must be non-negative'),
    body('paymentMode').isIn(['cash', 'bank', 'credit']).withMessage('Invalid payment mode'),
    body('paidAmount').isFloat({ min: 0 }).withMessage('Paid amount must be non-negative')
  ],
  update: [
    commonValidations.mongoId,
    commonValidations.optionalDate,
    body('customerId').optional().isMongoId().withMessage('Invalid customer ID'),
    body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
    body('paymentMode').optional().isIn(['cash', 'bank', 'credit']).withMessage('Invalid payment mode'),
    body('paidAmount').optional().isFloat({ min: 0 }).withMessage('Paid amount must be non-negative')
  ]
};

// Purchase validation rules
const purchaseValidations = {
  create: [
    commonValidations.date,
    body('supplierId').isMongoId().withMessage('Invalid supplier ID'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.itemId').isMongoId().withMessage('Invalid item ID'),
    body('items.*.qty').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.cost').isFloat({ min: 0 }).withMessage('Cost must be positive'),
    body('items.*.taxPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax percent must be between 0 and 100'),
    body('paymentMode').isIn(['cash', 'bank', 'credit']).withMessage('Invalid payment mode'),
    body('paidAmount').isFloat({ min: 0 }).withMessage('Paid amount must be non-negative')
  ],
  update: [
    commonValidations.mongoId,
    commonValidations.optionalDate,
    body('supplierId').optional().isMongoId().withMessage('Invalid supplier ID'),
    body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
    body('paymentMode').optional().isIn(['cash', 'bank', 'credit']).withMessage('Invalid payment mode'),
    body('paidAmount').optional().isFloat({ min: 0 }).withMessage('Paid amount must be non-negative')
  ]
};

// Transaction validation rules
const transactionValidations = {
  cash: [
    commonValidations.date,
    body('type').isIn(['receipt', 'payment']).withMessage('Type must be receipt or payment'),
    body('partyId').optional().isMongoId().withMessage('Invalid party ID'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('narration').trim().notEmpty().withMessage('Narration is required')
  ],
  bank: [
    commonValidations.date,
    body('bankName').trim().notEmpty().withMessage('Bank name is required'),
    body('type').isIn(['deposit', 'withdrawal']).withMessage('Type must be deposit or withdrawal'),
    body('partyId').optional().isMongoId().withMessage('Invalid party ID'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('narration').trim().notEmpty().withMessage('Narration is required')
  ]
};

// Report validation rules
const reportValidations = {
  dateRange: [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('groupBy').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid group by option')
  ],
  pagination: [
    commonValidations.page,
    commonValidations.limit
  ]
};

// Settings validation rules
const settingsValidations = {
  update: [
    body('companyName').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
    body('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('taxType').optional().isIn(['gst', 'vat', 'none', 'other']).withMessage('Invalid tax type'),
    body('invoicePrefix').optional().trim().notEmpty().withMessage('Invoice prefix cannot be empty'),
    body('financialYear').optional().trim().notEmpty().withMessage('Financial year cannot be empty'),
    body('currency').optional().trim().notEmpty().withMessage('Currency cannot be empty'),
    body('decimalPlaces').optional().isInt({ min: 0, max: 4 }).withMessage('Decimal places must be between 0 and 4')
  ]
};

// Voucher validation rules
const voucherValidations = {
  create: [
    body('voucherType').isIn(['JV', 'CRV', 'CPV', 'BPV', 'BRV']).withMessage('Invalid voucher type'),
    commonValidations.date,
    body('branch').optional().trim().notEmpty().withMessage('Branch cannot be empty'),
    body('entries').isArray({ min: 1 }).withMessage('At least one entry is required'),
    body('entries.*.account').trim().notEmpty().withMessage('Account name is required'),
    body('entries.*.debit').optional().isFloat({ min: 0 }).withMessage('Debit must be positive'),
    body('entries.*.credit').optional().isFloat({ min: 0 }).withMessage('Credit must be positive'),
    body('narration').optional().trim().isLength({ max: 500 }).withMessage('Narration too long')
  ],
  update: [
    commonValidations.mongoId,
    body('voucherType').optional().isIn(['JV', 'CRV', 'CPV', 'BPV', 'BRV']).withMessage('Invalid voucher type'),
    commonValidations.optionalDate,
    body('branch').optional().trim().notEmpty().withMessage('Branch cannot be empty'),
    body('entries').optional().isArray({ min: 1 }).withMessage('At least one entry is required'),
  ],
  narration: [
    body('narration').optional().trim().isLength({ max: 500 }).withMessage('Narration too long')
  ]
};

// Expense validation rules
const expenseValidations = {
  create: [
    commonValidations.date,
    body('head').trim().notEmpty().withMessage('Expense head is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('paymentMode').isIn(['cash', 'bank', 'cheque', 'card', 'upi', 'online']).withMessage('Invalid payment mode'),
    body('description').optional().trim()
  ],
  update: [
    commonValidations.mongoId,
    commonValidations.optionalDate,
    body('head').optional().trim().notEmpty().withMessage('Expense head cannot be empty'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('paymentMode').optional().isIn(['cash', 'bank', 'cheque', 'card', 'upi', 'online']).withMessage('Invalid payment mode')
  ]
};

// Payroll validation rules
const payrollValidations = {
  create: [
    body('employee').isMongoId().withMessage('Invalid employee ID'),
    body('monthYear').matches(/^\d{4}-\d{2}$/).withMessage('Invalid monthYear format (YYYY-MM)'),
    body('branch').trim().notEmpty().withMessage('Branch is required')
  ],
  update: [
    commonValidations.mongoId,
    body('monthYear').optional().matches(/^\d{4}-\d{2}$/).withMessage('Invalid monthYear format (YYYY-MM)')
  ]
};

// Employee validation rules
const employeeValidations = {
  create: [
    body('code').trim().notEmpty().withMessage('Employee code is required'),
    body('name').trim().notEmpty().withMessage('Employee name is required'),
    body('branch').trim().notEmpty().withMessage('Branch is required'),
    body('department').optional().isMongoId().withMessage('Invalid department ID'),
    body('designation').optional().isMongoId().withMessage('Invalid designation ID')
  ],
  update: [
    commonValidations.mongoId,
    body('name').optional().trim().notEmpty().withMessage('Employee name cannot be empty')
  ]
};

// Account validation rules
const accountValidations = {
  setup: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('code').optional().trim()
  ],
  ledger: [
    body('name').trim().notEmpty().withMessage('Account name is required'),
    body('category').isMongoId().withMessage('Valid category ID required')
  ]
};

module.exports = {
  handleValidationErrors,
  commonValidations,
  userValidations,
  itemValidations,
  partyValidations,
  saleValidations,
  purchaseValidations,
  transactionValidations,
  reportValidations,
  settingsValidations,
  voucherValidations,
  expenseValidations,
  payrollValidations,
  employeeValidations,
  accountValidations
};
