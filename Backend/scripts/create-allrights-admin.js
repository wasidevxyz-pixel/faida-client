require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

const GROUP_NAME = 'ALLRIGHTS';

const ALL_RIGHTS_LIST = [
  // Core Administration & Dashboard
  'admin',
  'dashboard',
  'hr_dashboard',
  'food_invoice',
  'administration',
  'users',
  'groups',
  'system_logs',
  'actions_tracker_link',
  'audit_logs',
  'stores',
  'parties',
  'commission_item',
  'commission_delete_item',
  'wht_supplier_link',
  'delete_wht_supplier',

  // Accounts & Vouchers
  'accounts',
  'payment_vouchers',
  'pv_supplier',
  'pv_supplier_list',
  'pv_category',
  'pv_category_list',
  'vouchers',
  'expenses',
  'account_register',
  'account_groups',
  'account_categories',
  'easypaisa_settlement',

  // Day Closing & Cash
  'closing',
  'branch_departments',
  'daily_cash',
  'cash_counter',
  'closing_sheet',
  'zakat_entry',

  // Warehouse & Inventory
  'warehouse',
  'wh_supplier',
  'wh_customer',
  'wh_item',
  'wh_delete_item',
  'wh_purchase',
  'wh_purchase_delete',
  'wh_purchase_edit',
  'wh_purchase_edit_posted',
  'wh_purchase_return',
  'wh_purchase_return_delete',
  'wh_purchase_return_edit',
  'wh_purchase_return_edit_posted',
  'wh_sale',
  'wh_sale_delete',
  'wh_sale_edit',
  'wh_sale_edit_posted',
  'wh_pos_sale',
  'wh_pos_return_approve',
  'wh_sale_return',
  'wh_sale_return_delete',
  'wh_sale_return_edit',
  'wh_sale_return_edit_posted',
  'wh_customer_payment',
  'wh_barcode_print',
  'wh_stock_audit',

  // Payroll & HR
  'payroll',
  'employee_registration',
  'delete_employee_reg',
  'attendance',
  'adv_attendance_reconciliation',
  'employee_advance',
  'monthly_payroll',
  'holy_days',
  'employee_penalty',
  'emp_commission',
  'distribute_emp_commission',
  'ug_emp_commission',
  'emp_clearance',
  'emp_adjustment',
  'legacy_payroll_archive',

  // Bank Management
  'bank_mgmt',
  'banks',
  'bank_management',
  'bank_detail_delete',
  'bank_payment_delete',

  // Sales
  'sales',
  'customer_demand',
  'new_sale',
  'sale_returns',
  'customer_receipt',

  // Purchase
  'purchase',
  'new_purchase',
  'purchase_returns',
  'supplier_payment',
  'supplier_wh_tax_link',
  'exemption_invoices_link',

  // Stock
  'stock',
  'stock_adjustments',

  // Reports
  'reports',
  'warehouse_sales_reports',
  'sales_report_link',
  'sales_comparison_link',
  'date_wise_sales_link',
  'payment_reports_link',
  'warehouse_reports',
  'wh_customer_ledger_rpt',
  'wh_customer_balance_rpt',
  'wh_stock_position_rpt',
  'wh_item_ledger_rpt',
  'wh_stock_activity_rpt',
  'shop_reports',
  'dept_wise_report_link',
  'sub_dept_wise_report_link',
  'shop_date_wise_sale_link',
  'pending_chq_details_link',
  'sales_reports',
  'dept_sale_link',
  'cash_counter_rpt_link',
  'receipts_link',
  'party_stmt_link',
  'emp_salary_reports',
  'emp_ledger_rpt_link',
  'emp_balances_rpt_link',
  'advance_pay_rec_rpt_link',
  'emp_salary_detail_rpt_link',
  'emp_increment_rpt_link',
  'bank_paid_salary_rpt_link',
  'cash_paid_salary_rpt_link',
  'emp_payroll_status_rpt_link',
  'emp_payroll_list_rpt_link',
  'emp_payroll_summary_rpt_link',
  'employee_advance_activity_rpt_link',
  'emp_attendance_rpt_link',
  'overtime_shorttime_report',
  'short_week_report_link',
  'emp_schedule_report_link',
  'categorized_branch_report_link',
  'employees_info_report_link',
  'wh_ded_report_link',
  'purchase_reports',
  'purchase_rpt_link',
  'supp_pay_link',
  'supplier_tax_cert_link',
  'supplier_tax_report_link',
  'exemption_invoices_report_link',
  'stock_reports',
  'stock_rpt_link',
  'stock_adj_rpt_link',
  'stock_audit_rpt_link',
  'financial_reports',
  'pl_link',
  'ledger_link',
  'bank_ledger_link',
  'expense_rpt_link',
  'income_statement_link',
  'pv_supplier_rpt_link',
  'pv_category_rpt_link',

  // System Settings
  'settings',
  'settings_company',
  'settings_invoice',
  'settings_tax',
  'settings_backup',
  'settings_apiKey'
];

const allRights = Object.fromEntries(
  Array.from(new Set(ALL_RIGHTS_LIST)).map((right) => [right, true])
);

async function createAllRightsAdmin() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/FAIDA-CLIENT';
  const email = (process.env.BW_ADMIN_EMAIL || process.argv[2] || 'wasi@bw.com').trim().toLowerCase();
  const password = process.env.BW_ADMIN_PASSWORD || process.argv[3] || 'Waseem123';
  const name = process.env.BW_ADMIN_NAME || process.argv[4] || 'Wasi';

  if (!email || !password) {
    throw new Error('Email and password must be provided via environment variables, arguments, or .env file.');
  }

  console.log(`Connecting to MongoDB (${mongoUri})...`);
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  // 1. Create or update Group
  let group = await Group.findOne({ name: GROUP_NAME });
  if (!group) {
    group = await Group.create({
      name: GROUP_NAME,
      description: 'Full administrative access to all system features',
      rights: allRights,
      isAdmin: true,
      isActive: true
    });
    console.log(`✓ Created new Group: ${GROUP_NAME} with ${Object.keys(allRights).length} enabled rights.`);
  } else {
    group.rights = allRights;
    group.isAdmin = true;
    group.isActive = true;
    group.description = 'Full administrative access to all system features';
    await group.save();
    console.log(`✓ Updated existing Group: ${GROUP_NAME} with ${Object.keys(allRights).length} enabled rights.`);
  }

  // 2. Create or update User
  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      isActive: true,
      groupId: group._id,
      permissions: Object.keys(allRights)
    });
    console.log(`✓ Created new User: ${email} (${name}) with role 'admin' and full permissions.`);
  } else {
    user.name = name;
    user.password = password; // Trigger pre('save') hash
    user.role = 'admin';
    user.isActive = true;
    user.groupId = group._id;
    user.permissions = Object.keys(allRights);
    await user.save();
    console.log(`✓ Updated existing User: ${email} with new password, role 'admin', and full permissions.`);
  }

  // 3. Verify user and credentials
  const savedUser = await User.findOne({ email })
    .select('+password')
    .populate('groupId');

  const savedRights = savedUser.groupId.rights;
  const rightsObj = savedRights instanceof Map ? Object.fromEntries(savedRights) : savedRights;
  const isPasswordValid = await savedUser.matchPassword(password);

  const hasExpectedAccess = savedUser.role === 'admin'
    && savedUser.isActive
    && savedUser.groupId.name === GROUP_NAME
    && isPasswordValid
    && Object.keys(rightsObj).length >= Object.keys(allRights).length;

  if (!hasExpectedAccess) {
    throw new Error('Created account verification failed.');
  }

  console.log('\n======================================================');
  console.log('✅ User registered successfully with ALL rights:');
  console.log('======================================================');
  console.log(`Name:        ${savedUser.name}`);
  console.log(`Email/Login: ${savedUser.email}`);
  console.log(`Role:        ${savedUser.role}`);
  console.log(`Group:       ${savedUser.groupId.name} (isAdmin: ${savedUser.groupId.isAdmin})`);
  console.log(`Total Rights Enabled: ${Object.keys(rightsObj).length}`);
  console.log(`Password Hash Verified: ${isPasswordValid ? 'YES' : 'NO'}`);
  console.log('======================================================\n');
}

createAllRightsAdmin()
  .catch((error) => {
    console.error(`❌ Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  });
