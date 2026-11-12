require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

const GROUP_NAME = 'ALLRIGHTS';
const allRights = Object.fromEntries([
  'dashboard',
  'administration', 'users', 'groups', 'stores', 'parties', 'commission_item', 'wht_supplier_link',
  'accounts', 'pv_supplier', 'pv_supplier_list', 'pv_category', 'pv_category_list',
  'vouchers', 'expenses', 'account_register', 'account_groups', 'account_categories',
  'closing', 'branch_departments', 'daily_cash', 'cash_counter', 'closing_sheet', 'zakat_entry',
  'warehouse', 'wh_supplier', 'wh_customer', 'wh_item', 'wh_purchase', 'wh_purchase_return',
  'wh_sale', 'wh_pos_sale', 'wh_sale_return', 'wh_customer_payment', 'wh_barcode_print', 'wh_stock_audit',
  'payroll', 'employee_registration', 'attendance', 'employee_advance', 'monthly_payroll',
  'holy_days', 'employee_penalty', 'emp_commission', 'ug_emp_commission', 'emp_clearance',
  'emp_adjustment',
  'bank_mgmt', 'bank_management', 'banks',
  'reports', 'sales_reports', 'warehouse_sales_reports', 'cash_counter_rpt_link',
  'employees_info_report_link',
  'sales', 'customer_demand', 'new_sale', 'sale_returns', 'customer_receipt',
  'purchase', 'new_purchase', 'purchase_returns', 'supplier_payment', 'supplier_wh_tax_link',
  'exemption_invoices_link',
  'stock', 'stock_adjustments',
  'settings', 'settings_company', 'settings_invoice', 'settings_tax', 'settings_backup',
  'settings_apiKey', 'admin', 'payment_vouchers'
].map((right) => [right, true]));

async function createAllRightsAdmin() {
  const { MONGO_URI, BW_ADMIN_EMAIL, BW_ADMIN_PASSWORD } = process.env;
  if (!MONGO_URI || !BW_ADMIN_EMAIL || !BW_ADMIN_PASSWORD) {
    throw new Error('MONGO_URI, BW_ADMIN_EMAIL, and BW_ADMIN_PASSWORD must be configured.');
  }

  await mongoose.connect(MONGO_URI);

  if (await User.exists({ email: BW_ADMIN_EMAIL })) {
    throw new Error('The requested user already exists; no changes were made.');
  }
  if (await Group.exists({ name: GROUP_NAME })) {
    throw new Error('The ALLRIGHTS group already exists; no changes were made.');
  }

  const group = await Group.create({
    name: GROUP_NAME,
    description: 'Full administrative access to all system features',
    rights: allRights,
    isAdmin: true
  });

  let user;
  try {
    user = await User.create({
      name: 'Wasi',
      email: BW_ADMIN_EMAIL,
      password: BW_ADMIN_PASSWORD,
      role: 'admin',
      isActive: true,
      groupId: group._id
    });

    const savedUser = await User.findOne({ email: BW_ADMIN_EMAIL })
      .select('+password')
      .populate('groupId');
    const savedRights = savedUser.groupId.rights;
    const rights = savedRights instanceof Map ? Object.fromEntries(savedRights) : savedRights;
    const hasExpectedAccess = savedUser.role === 'admin'
      && savedUser.isActive
      && savedUser.groupId.name === GROUP_NAME
      && await savedUser.matchPassword(BW_ADMIN_PASSWORD)
      && Object.keys(rights).length === Object.keys(allRights).length
      && Object.values(rights).every((enabled) => enabled === true);

    if (!hasExpectedAccess) {
      throw new Error('Created account verification failed.');
    }
  } catch (error) {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }
    await Group.deleteOne({ _id: group._id });
    throw error;
  }

  console.log(`Created active admin user and ${GROUP_NAME} group with ${Object.keys(allRights).length} enabled rights.`);
}

createAllRightsAdmin()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
