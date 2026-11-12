/**
 * D.WATSON's server-owned allowlist for ERP actions.
 *
 * The Python Brain may suggest an action, but it can never grant access to one.
 * This catalog is the policy enforcement point and deliberately starts read-only.
 */
const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);
const ADMIN_RIGHTS = new Set(['admin', 'administration']);
const { findReport } = require('./aiReportRegistry');

const actions = [
{ id: 'accounts.open', type: 'navigate', route: '/accounts', label: 'Accounts', rights: ['accounts'] },
  { id: 'account_categories.open', type: 'navigate', route: '/account-categories', label: 'Account Categories', rights: ['account_categories'] },
  { id: 'account_groups.open', type: 'navigate', route: '/account-groups', label: 'Account Groups', rights: ['account_groups'] },
  { id: 'attendance_list.open', type: 'navigate', route: '/attendance-list', label: 'Attendance List', rights: ['attendance'] },
  { id: 'import_attendance.open', type: 'navigate', route: '/import-attendance', label: 'Import Attendance', rights: ['attendance'] },
  { id: 'employee_attendance_detail.open', type: 'navigate', route: '/employee-attendance-detail', label: 'Employee Attendance Detail', rights: ['attendance'] },
  { id: 'employee_attendance_report.open', type: 'navigate', route: '/employee-attendance-report', label: 'Employee Attendance Report', rights: ['attendance','emp_attendance_rpt_link'] },
  { id: 'overtime_shorttime_report.open', type: 'navigate', route: '/overtime-shorttime-report', label: 'Overtime Shorttime Report', rights: ['attendance','overtime_shorttime_report'] },
  { id: 'short_week_report.open', type: 'navigate', route: '/employee-short-week-report', label: 'Short Week (TSW) Report', rights: ['emp_salary_reports','short_week_report_link'] },
  { id: 'employee_schedule_report.open', type: 'navigate', route: '/employee-schedule-report', label: 'Employee Schedule Report', rights: ['attendance','emp_schedule_report_link'] },
  { id: 'audit_logs.open', type: 'navigate', route: '/audit-logs', label: 'Audit Logs', rights: ['audit_logs'] },
  { id: 'backup.open', type: 'navigate', route: '/backup', label: 'Backup', rights: ['administration'] },
  { id: 'banks.open', type: 'navigate', route: '/banks', label: 'Banks', rights: ['banks'] },
  { id: 'bank_management.open', type: 'navigate', route: '/bank-management', label: 'Bank Management', rights: ['bank_management'] },
  { id: 'bank_ledger.open', type: 'navigate', route: '/bank-ledger', label: 'Bank Ledger', rights: ['banks','bank_management','bank_ledger_link'] },
  { id: 'bank_paid_salary_report.open', type: 'navigate', route: '/bank-paid-salary-report', label: 'Bank Paid Salary Report', rights: ['monthly_payroll','bank_paid_salary_rpt_link'] },
  { id: 'bank_summary_pro.open', type: 'navigate', route: '/bank-summary-pro', label: 'Bank Summary Pro', rights: ['bank_mgmt'] },
  { id: 'pending_cheque_v2.open', type: 'navigate', route: '/pending-cheque-v2', label: 'Pending Cheque V2', rights: ['bank_mgmt'] },
  { id: 'cash_counter.open', type: 'navigate', route: '/cash-counter', label: 'Cash Counter', rights: ['cash_counter'] },
  { id: 'cash_counter_report.open', type: 'navigate', route: '/cash-counter-report', label: 'Cash Counter Report', rights: ['cash_counter','cash_counter_rpt_link'] },
  { id: 'cash_paid_salary_report.open', type: 'navigate', route: '/cash-paid-salary-report', label: 'Cash Paid Salary Report', rights: ['monthly_payroll','cash_paid_salary_rpt_link'] },
  { id: 'daily_cash.open', type: 'navigate', route: '/daily-cash', label: 'Daily Cash', rights: ['daily_cash'] },
  { id: 'cash_sales.open', type: 'navigate', route: '/cash-sales', label: 'Cash Sales', rights: ['new_sale'] },
  { id: 'customer_demand.open', type: 'navigate', route: '/customer-demand', label: 'Customer Demand', rights: ['customer_demand'] },
  { id: 'customer_payments.open', type: 'navigate', route: '/customer-payments', label: 'Customer Payments', rights: ['customer_receipt'] },
  { id: 'customer_categories.open', type: 'navigate', route: '/customer-categories', label: 'Customer Categories', rights: ['administration'] },
  { id: 'customer_receipts_report.open', type: 'navigate', route: '/customer-receipts-report', label: 'Customer Receipts Report', rights: ['customer_receipt','receipts_link'] },
  { id: 'closing_sheet.open', type: 'navigate', route: '/closing-sheet', label: 'Closing Sheet', rights: ['closing_sheet'] },
  { id: 'closing_sheet_tabs.open', type: 'navigate', route: '/closing-sheet-tabs', label: 'Closing Sheet Tabs', rights: ['closing_sheet'] },
  { id: 'print_closing_sheet.open', type: 'navigate', route: '/print-closing-sheet', label: 'Print Closing Sheet', rights: ['closing_sheet'] },
  { id: 'commission_item.open', type: 'navigate', route: '/commission-item', label: 'Commission Item', rights: ['commission_item'] },
  { id: 'commission_supplier.open', type: 'navigate', route: '/commission-supplier', label: 'Commission Supplier', rights: ['commission_item'] },
  { id: 'commission_category.open', type: 'navigate', route: '/commission-category', label: 'Commission Category', rights: ['commission_item'] },
  { id: 'commission_branch.open', type: 'navigate', route: '/commission-branch', label: 'Commission Branch', rights: ['commission_item'] },
  { id: 'companies.open', type: 'navigate', route: '/companies', label: 'Companies', rights: ['administration'] },
  { id: 'classes.open', type: 'navigate', route: '/classes', label: 'Classes', rights: ['administration'] },
  { id: 'subclasses.open', type: 'navigate', route: '/subclasses', label: 'Subclasses', rights: ['administration'] },
  { id: 'categories.open', type: 'navigate', route: '/categories', label: 'Categories', rights: ['administration'] },
  { id: 'item_categories.open', type: 'navigate', route: '/item-categories', label: 'Item Categories', rights: ['administration'] },
  { id: 'supplier_categories.open', type: 'navigate', route: '/supplier-categories', label: 'Supplier Categories', rights: ['administration'] },
  { id: 'departments.open', type: 'navigate', route: '/departments', label: 'Departments', rights: ['branch_departments'] },
  { id: 'designations.open', type: 'navigate', route: '/designations', label: 'Designations', rights: ['employee_registration'] },
  { id: 'branch_departments.open', type: 'navigate', route: '/branch-departments', label: 'Branch Departments', rights: ['branch_departments'] },
  { id: 'employee_list.open', type: 'navigate', route: '/employee-list', label: 'Employee List', rights: ['employee_registration'] },
  { id: 'employee_registration.open', type: 'navigate', route: '/employee-registration', label: 'Employee Registration', rights: ['employee_registration'] },
  { id: 'employee_advance.open', type: 'navigate', route: '/employee-advance', label: 'Employee Advance', rights: ['employee_advance'] },
  { id: 'employee_advance_activity.open', type: 'navigate', route: '/employee-advance-activity', label: 'Employee Advance Activity', rights: ['employee_advance','employee_advance_activity_rpt_link'] },
  { id: 'employee_adjustment.open', type: 'navigate', route: '/employee-adjustment', label: 'Employee Adjustment', rights: ['emp_adjustment'] },
  { id: 'employee_commission.open', type: 'navigate', route: '/employee-commission', label: 'Employee Commission', rights: ['emp_commission'] },
  { id: 'employee_sale_commission.open', type: 'navigate', route: '/employee-sale-commission', label: 'Employee Sale Commission', rights: ['ug_emp_commission'] },
  { id: 'employee_clearance.open', type: 'navigate', route: '/employee-clearance', label: 'Employee Clearance', rights: ['emp_clearance'] },
  { id: 'employee_penalty.open', type: 'navigate', route: '/employee-penalty', label: 'Employee Penalty', rights: ['employee_penalty'] },
  { id: 'employee_increment_report.open', type: 'navigate', route: '/employee-increment-report', label: 'Employee Increment Report', rights: ['employee_registration','emp_increment_rpt_link'] },
  { id: 'employee_balances_report.open', type: 'navigate', route: '/employee-balances-report', label: 'Employee Balances Report', rights: ['employee_registration','emp_balances_rpt_link'] },
  { id: 'employee_ledger_report.open', type: 'navigate', route: '/employee-ledger-report', label: 'Employee Ledger Report', rights: ['employee_registration','emp_ledger_rpt_link'] },
  { id: 'advance_pay_rec_report.open', type: 'navigate', route: '/advance-pay-rec-report', label: 'Advance Pay Rec Report', rights: ['advance_pay_rec_rpt_link'] },
  { id: 'expenses.open', type: 'navigate', route: '/expenses', label: 'Expenses', rights: ['expenses'] },
  { id: 'expense_report.open', type: 'navigate', route: '/expense-report', label: 'Expense Report', rights: ['expenses','expense_rpt_link'] },
  { id: 'exemption_invoices.open', type: 'navigate', route: '/exemption-invoices', label: 'Exemption Invoices', rights: ['exemption_invoices_link'] },
  { id: 'exemption_invoices_report.open', type: 'navigate', route: '/exemption-invoices-report', label: 'Exemption Invoices Report', rights: ['exemption_invoices_report_link'] },
  { id: 'food_invoice.open', type: 'navigate', route: '/food-invoice', label: 'Food Invoice', rights: ['food_invoice'] },
  { id: 'groups.open', type: 'navigate', route: '/groups', label: 'Groups', rights: ['groups'] },
  { id: 'check_rights.open', type: 'navigate', route: '/check-rights', label: 'Check Rights', rights: ['groups'] },
  { id: 'holy_days.open', type: 'navigate', route: '/holy-days', label: 'Holy Days', rights: ['holy_days'] },
  { id: 'hr_dashboard.open', type: 'navigate', route: '/hr-dashboard', label: 'Hr Dashboard', rights: ['hr_dashboard'] },
  { id: 'dashboard.open', type: 'navigate', route: '/dashboard', label: 'Dashboard', rights: ['dashboard'] },
  { id: 'income_statement.open', type: 'navigate', route: '/income-statement', label: 'Income Statement', rights: ['income_statement_link'] },
  { id: 'items.open', type: 'navigate', route: '/items', label: 'Items', rights: ['wh_item'] },
  { id: 'stores.open', type: 'navigate', route: '/stores', label: 'Stores', rights: ['stores'] },
  { id: 'stock.open', type: 'navigate', route: '/stock', label: 'Stock', rights: ['stock'] },
  { id: 'stock_adjustments.open', type: 'navigate', route: '/stock-adjustments', label: 'Stock Adjustments', rights: ['stock_adjustments'] },
  { id: 'stock_audit.open', type: 'navigate', route: '/stock-audit', label: 'Stock Audit', rights: ['wh_stock_audit'] },
  { id: 'stock_report.open', type: 'navigate', route: '/stock-report', label: 'Stock Report', rights: ['stock','stock_rpt_link'] },
  { id: 'stock_adjustments_report.open', type: 'navigate', route: '/stock-adjustments-report', label: 'Stock Adjustments Report', rights: ['stock_adj_rpt_link'] },
  { id: 'stock_position_report.open', type: 'navigate', route: '/stock-position-report', label: 'Stock Position Report', rights: ['wh_stock_position_rpt'] },
  { id: 'stock_audit_report.open', type: 'navigate', route: '/stock-audit-report', label: 'Stock Audit Report', rights: ['stock_audit_rpt_link'] },
  { id: 'ledger_report.open', type: 'navigate', route: '/ledger-report', label: 'Ledger Report', rights: ['ledger_link'] },
  { id: 'legacy_payroll.open', type: 'navigate', route: '/legacy-payroll', label: 'Legacy Payroll', rights: ['legacy_payroll_archive'] },
  { id: 'parties.open', type: 'navigate', route: '/parties', label: 'Parties', rights: ['parties'] },
  { id: 'suppliers.open', type: 'navigate', route: '/suppliers', label: 'Suppliers', rights: ['wh_supplier'] },
  { id: 'supplier_payments.open', type: 'navigate', route: '/supplier-payments', label: 'Supplier Payments', rights: ['supplier_payment'] },
  { id: 'supplier_tax_certificate.open', type: 'navigate', route: '/supplier-tax-certificate', label: 'Supplier Tax Certificate', rights: ['supplier_tax_cert_link'] },
  { id: 'supplier_tax_report.open', type: 'navigate', route: '/supplier-tax-report', label: 'Supplier Tax Report', rights: ['supplier_tax_report_link'] },
  { id: 'supplier_wh_tax.open', type: 'navigate', route: '/supplier-wh-tax', label: 'Supplier Wh Tax', rights: ['supplier_wh_tax_link'] },
  { id: 'payroll.open', type: 'navigate', route: '/payroll', label: 'Payroll', rights: ['monthly_payroll'] },
  { id: 'payroll_report.open', type: 'navigate', route: '/payroll-report', label: 'Payroll Report', rights: ['monthly_payroll','categorized_branch_report_link'] },
  { id: 'print_payroll.open', type: 'navigate', route: '/print-payroll', label: 'Print Payroll', rights: ['monthly_payroll'] },
  { id: 'employee_payroll_list.open', type: 'navigate', route: '/employee-payroll-list', label: 'Employee Payroll List', rights: ['monthly_payroll','emp_payroll_list_rpt_link'] },
  { id: 'employee_payroll_status.open', type: 'navigate', route: '/employee-payroll-status', label: 'Employee Payroll Status', rights: ['monthly_payroll','emp_payroll_status_rpt_link'] },
  { id: 'employee_payroll_summary_report.open', type: 'navigate', route: '/employee-payroll-summary-report', label: 'Employee Payroll Summary Report', rights: ['monthly_payroll','emp_payroll_summary_rpt_link'] },
  { id: 'employee_salary_detail_report.open', type: 'navigate', route: '/employee-salary-detail-report', label: 'Employee Salary Detail Report', rights: ['monthly_payroll','emp_salary_detail_rpt_link'] },
  { id: 'wh_ded_report.open', type: 'navigate', route: '/wh-ded-report', label: 'Wh Ded Report', rights: ['wh_ded_report_link'] },
  { id: 'print_employee_payroll_status.open', type: 'navigate', route: '/print-employee-payroll-status', label: 'Print Employee Payroll Status', rights: ['monthly_payroll','emp_payroll_status_rpt_link'] },
  { id: 'payments.open', type: 'navigate', route: '/payments', label: 'Payments', rights: ['payment_vouchers'] },
  { id: 'payment_reports.open', type: 'navigate', route: '/payment-reports', label: 'Payment Reports', rights: ['payment_vouchers','payment_reports_link'] },
  { id: 'payment_vouchers.open', type: 'navigate', route: '/payment-vouchers', label: 'Payment Vouchers', rights: ['payment_vouchers'] },
  { id: 'payment_vouchers_list.open', type: 'navigate', route: '/payment-vouchers-list', label: 'Payment Vouchers List', rights: ['payment_vouchers'] },
  { id: 'payment_voucher_print.open', type: 'navigate', route: '/payment-voucher-print', label: 'Payment Voucher Print', rights: ['payment_vouchers'] },
  { id: 'profit_loss_report.open', type: 'navigate', route: '/profit-loss-report', label: 'Profit Loss Report', rights: ['pl_link'] },
  { id: 'purchases.open', type: 'navigate', route: '/purchases', label: 'Purchases', rights: ['new_purchase'] },
  { id: 'purchase_returns.open', type: 'navigate', route: '/purchase-returns', label: 'Purchase Returns', rights: ['purchase_returns'] },
  { id: 'purchase_report.open', type: 'navigate', route: '/purchase-report', label: 'Purchase Report', rights: ['new_purchase','purchase_rpt_link'] },
  { id: 'receipts.open', type: 'navigate', route: '/receipts', label: 'Receipts', rights: ['customer_receipt'] },
  { id: 'reports.open', type: 'navigate', route: '/reports', label: 'Reports', rights: ['reports'] },
  { id: 'sales_report.open', type: 'navigate', route: '/sales-report', label: 'Sales Report', rights: ['new_sale','sales_report_link'] },
  { id: 'date_wise_sales_report.open', type: 'navigate', route: '/date-wise-sales-report', label: 'Date Wise Sales Report', rights: ['new_sale','date_wise_sales_link'] },
  { id: 'sales_comparison_report.open', type: 'navigate', route: '/sales-comparison-report', label: 'Sales Comparison Report', rights: ['new_sale','sales_comparison_link'] },
  { id: 'department_sales_report.open', type: 'navigate', route: '/department-sales-report', label: 'Department Sales Report', rights: ['new_sale','dept_sale_link'] },
  { id: 'party_statement_report.open', type: 'navigate', route: '/party-statement-report', label: 'Party Statement Report', rights: ['party_stmt_link'] },
  { id: 'wh_customer_ledger_report.open', type: 'navigate', route: '/wh-customer-ledger-report', label: 'Wh Customer Ledger Report', rights: ['wh_customer_ledger_rpt'] },
  { id: 'wh_customer_balance_report.open', type: 'navigate', route: '/wh-customer-balance-report', label: 'Wh Customer Balance Report', rights: ['wh_customer_balance_rpt'] },
  { id: 'wh_item_ledger_report.open', type: 'navigate', route: '/wh-item-ledger-report', label: 'Wh Item Ledger Report', rights: ['wh_item_ledger_rpt'] },
  { id: 'wh_stock_activity_report.open', type: 'navigate', route: '/wh-stock-activity-report', label: 'Wh Stock Activity Report', rights: ['wh_stock_activity_rpt'] },
  { id: 'dept_wise_report.open', type: 'navigate', route: '/dept-wise-report', label: 'Dept Wise Report', rights: ['dept_wise_report_link'] },
  { id: 'sub_dept_wise_report.open', type: 'navigate', route: '/sub-dept-wise-report', label: 'Sub Dept Wise Report', rights: ['sub_dept_wise_report_link'] },
  { id: 'shop_date_wise_sale_report.open', type: 'navigate', route: '/shop-date-wise-sale-report', label: 'Shop Date Wise Sale Report', rights: ['shop_date_wise_sale_link'] },
  { id: 'pending_chq_details.open', type: 'navigate', route: '/pending-chq-details', label: 'Pending Chq Details', rights: ['pending_chq_details_link'] },
  { id: 'supplier_payments_report.open', type: 'navigate', route: '/supplier-payments-report', label: 'Supplier Payments Report', rights: ['supp_pay_link'] },
  { id: 'sales.open', type: 'navigate', route: '/sales', label: 'Sales', rights: ['new_sale'] },
  { id: 'sale_returns.open', type: 'navigate', route: '/sale-returns', label: 'Sale Returns', rights: ['sale_returns'] },
  { id: 'settings.open', type: 'navigate', route: '/settings', label: 'Settings', rights: ['settings'] },
  { id: 'sub_branches.open', type: 'navigate', route: '/sub-branches', label: 'Sub Branches', rights: ['administration'] },
  { id: 'taxes.open', type: 'navigate', route: '/taxes', label: 'Taxes', rights: ['administration'] },
  { id: 'zakats.open', type: 'navigate', route: '/zakats', label: 'Zakats', rights: ['zakat_entry'] },
  { id: 'units.open', type: 'navigate', route: '/units', label: 'Units', rights: ['administration'] },
  { id: 'users.open', type: 'navigate', route: '/users', label: 'Users', rights: ['users'] },
  { id: 'vouchers.open', type: 'navigate', route: '/vouchers', label: 'Vouchers', rights: ['vouchers'] },
  { id: 'voucher.open', type: 'navigate', route: '/voucher', label: 'Voucher', rights: ['vouchers'] },
  { id: 'vouchers_report.open', type: 'navigate', route: '/vouchers-report', label: 'Vouchers Report', rights: ['vouchers','pv_supplier_rpt_link','pv_category_rpt_link'] },
  { id: 'voucher_print.open', type: 'navigate', route: '/voucher-print', label: 'Voucher Print', rights: ['vouchers','expenses'] },
  { id: 'wh_customer.open', type: 'navigate', route: '/wh-customer', label: 'Wh Customer', rights: ['wh_customer'] },
  { id: 'wh_customer_payment.open', type: 'navigate', route: '/wh-customer-payment', label: 'Wh Customer Payment', rights: ['wh_customer_payment'] },
  { id: 'wh_item.open', type: 'navigate', route: '/wh-item', label: 'Wh Item', rights: ['wh_item'] },
  { id: 'wh_purchase.open', type: 'navigate', route: '/wh-purchase', label: 'Wh Purchase', rights: ['wh_purchase'] },
  { id: 'wh_purchase_return.open', type: 'navigate', route: '/wh-purchase-return', label: 'Wh Purchase Return', rights: ['wh_purchase_return'] },
  { id: 'wh_sale.open', type: 'navigate', route: '/wh-sale', label: 'Wh Sale', rights: ['wh_sale'] },
  { id: 'wh_sale_return.open', type: 'navigate', route: '/wh-sale-return', label: 'Wh Sale Return', rights: ['wh_sale_return'] },
  { id: 'wh_supplier.open', type: 'navigate', route: '/wh-supplier', label: 'Wh Supplier', rights: ['wh_supplier'] },
  { id: 'wh_barcode.open', type: 'navigate', route: '/wh-barcode', label: 'Wh Barcode', rights: ['wh_barcode_print'] },
  { id: 'wh_stock_audit.open', type: 'navigate', route: '/wh-stock-audit', label: 'Wh Stock Audit', rights: ['wh_stock_audit'] },
  { id: 'wh_print.open', type: 'navigate', route: '/wh-print', label: 'Wh Print', rights: ['wh_sale','wh_sale_return','wh_purchase','wh_purchase_return'] }
];

const metrics = [
  { id: 'daily_cash_batches', rights: ['daily_cash', 'bank_management', 'bank_mgmt'] },
  { id: 'get_bank_transactions', rights: ['bank_management', 'bank_mgmt', 'banks'] },
  { id: 'bank_payment_details', rights: ['bank_management', 'bank_mgmt', 'banks'] },
  { id: 'get_pending_cheques', rights: ['bank_management', 'bank_mgmt', 'banks'] },
  { id: 'get_bank_summary', rights: ['bank_management', 'bank_mgmt', 'banks'] },
  { id: 'employee_attendance_sheet', rights: ['attendance', 'emp_attendance_rpt_link'] },
  { id: 'last_purchase_invoice', rights: ['new_purchase', 'wh_purchase'] },
  { id: 'item_information', rights: ['wh_item'] },
  { id: 'item_sale_history', rights: ['wh_item', 'new_sale'] },
  { id: 'item_purchase_history', rights: ['wh_item', 'new_purchase'] },
  { id: 'today_sales', rights: ['new_sale', 'sales_report_link'] },
  { id: 'today_purchases', rights: ['new_purchase', 'purchase_rpt_link'] },
  { id: 'late_employees', rights: ['attendance', 'emp_attendance_rpt_link'] },
  { id: 'sales_summary', rights: ['new_sale', 'sales_report_link'] },
  { id: 'sales_department_report', rights: ['new_sale', 'sales_report_link'] },
  { id: 'dept_wise_sale_report', rights: ['new_sale', 'dept_sale_link', 'sales_report_link'] },
  { id: 'closing_sheet_daily_summary', rights: ['closing_sheet', 'new_sale', 'sales_report_link'] },
  { id: 'payment_report_data', rights: ['payment_vouchers', 'payment_reports_link'] },
  { id: 'wh_customer_balance_report_data', rights: ['wh_customer_balance_rpt'] },
  { id: 'wh_customer_ledger_report_data', rights: ['wh_customer_ledger_rpt'] },
  { id: 'wh_stock_position_report_data', rights: ['wh_stock_position_rpt'] },
  { id: 'wh_item_ledger_report_data', rights: ['wh_item_ledger_rpt'] },
  { id: 'wh_stock_activity_report_data', rights: ['wh_stock_activity_rpt'] },
  { id: 'employee_information', rights: ['employee_registration'] },
  { id: 'emp_commission', rights: ['emp_commission', 'ug_emp_commission'] },
  { id: 'salary_slip', rights: ['monthly_payroll'] },
  { id: 'users_list', rights: ['users'] }
];

function rightsFor(user) {
  const groupRights = user?.groupId?.rights;
  const normalizedGroupRights = groupRights instanceof Map
    ? Object.fromEntries(groupRights.entries())
    : (groupRights && typeof groupRights.toObject === 'function' ? groupRights.toObject() : groupRights || {});
  const individualRights = Array.isArray(user?.permissions) ? user.permissions : [];
  return new Set([
    ...Object.entries(normalizedGroupRights).filter(([, value]) => value === true || value === 'true').map(([key]) => key),
    ...individualRights
  ]);
}

function isAdmin(user, rights = rightsFor(user)) {
  return ADMIN_ROLES.has(String(user?.role || '').toLowerCase()) || [...ADMIN_RIGHTS].some(right => rights.has(right));
}

function canUseAction(user, action) {
  const rights = rightsFor(user);
  return isAdmin(user, rights) || action.rights.some(right => rights.has(right));
}

function findAction(candidate) {
  if (!candidate) return null;
  if (typeof candidate.id === 'string') {
    return actions.find(action => action.id === candidate.id) || null;
  }
  if (!['navigate', 'open_report'].includes(candidate.type)) return null;
  return actions.find(action => action.type === candidate.type && action.route === candidate.route) || null;
}

function allowedActionsFor(user) {
  return actions.filter(action => canUseAction(user, action));
}

function allowedMetricsFor(user) {
  return metrics.filter(metric => canUseAction(user, metric));
}

function findMetric(id) {
  return metrics.find(metric => metric.id === id) || null;
}

function publicAction(action) {
  const report = action.reportId ? findReport(action.reportId) : null;
  return { id: action.id, type: action.type, route: action.route, label: action.label, readOnly: true, ...(report ? { reportId: report.id } : {}) };
}

module.exports = { allowedActionsFor, allowedMetricsFor, canUseAction, findAction, findMetric, publicAction, rightsFor };
