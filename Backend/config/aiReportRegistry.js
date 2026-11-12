/**
 * Read-only report registry used by D.WATSON and future document exporters.
 * The registry describes existing ERP reports; it does not execute them.
 */
const reports = [
  { id: 'sales', label: 'Sales Report', screenRoute: '/sales-report', apiRoute: '/api/v1/reports/sales', exportRoute: '/api/v1/reports/sales/export', formats: ['screen', 'csv'], rights: ['new_sale', 'sales_report_link'] },
  { id: 'purchases', label: 'Purchase Report', screenRoute: '/purchase-report', apiRoute: '/api/v1/reports/purchases', exportRoute: '/api/v1/reports/purchases/export', formats: ['screen', 'csv'], rights: ['new_purchase', 'purchase_rpt_link'] },
  { id: 'stock', label: 'Stock Report', screenRoute: '/stock-report', apiRoute: '/api/v1/reports/stock', exportRoute: '/api/v1/reports/stock/export', formats: ['screen', 'csv'], rights: ['stock', 'stock_rpt_link'] },
  { id: 'warehouse_stock', label: 'Warehouse Stock in Hand Report', screenRoute: '/wh-stock-in-hand-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['stock', 'stock_rpt_link', 'wh_item'] },
  { id: 'bank_ledger', label: 'Bank Ledger Report', screenRoute: '/bank-ledger', apiRoute: '/api/v1/reports/bank-ledger', exportRoute: null, formats: ['screen'], rights: ['banks', 'bank_management', 'bank_ledger_link'] },
  { id: 'profit_loss', label: 'Profit & Loss Report', screenRoute: '/profit-loss-report', apiRoute: '/api/v1/reports/profit-loss', exportRoute: '/api/v1/reports/profit-loss/export', formats: ['screen', 'csv'], rights: ['pl_link'] },
  { id: 'income_statement', label: 'Income Statement', screenRoute: '/income-statement', apiRoute: '/api/v1/income-statement', exportRoute: null, formats: ['screen'], rights: ['income_statement_link'] },
  { id: 'ledger', label: 'Ledger Report', screenRoute: '/ledger-report', apiRoute: '/api/v1/reports/ledger', exportRoute: '/api/v1/reports/ledger/export', formats: ['screen', 'csv'], rights: ['ledger_link'] },
  { id: 'attendance', label: 'Attendance Report', screenRoute: '/employee-attendance-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['attendance', 'emp_attendance_rpt_link'] },
  { id: 'payroll_summary', label: 'Employee Payroll Summary', screenRoute: '/employee-payroll-summary-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['monthly_payroll', 'emp_payroll_summary_rpt_link'] },
  { id: 'employee_ledger', label: 'Employee Ledger Report', screenRoute: '/employee-ledger-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['employee_registration', 'emp_ledger_rpt_link'] },
  { id: 'expense', label: 'Expense Report', screenRoute: '/expense-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['expenses', 'expense_rpt_link'] },
  { id: 'payment', label: 'Payment Report', screenRoute: '/payment-reports', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['payment_vouchers', 'payment_reports_link'] },
  { id: 'supplier_payments', label: 'Supplier Payments Report', screenRoute: '/supplier-payments-report', apiRoute: null, exportRoute: null, formats: ['screen'], rights: ['supplier_payment', 'supp_pay_link'] }
];

function findReport(id) {
  return reports.find(report => report.id === id) || null;
}

function allowedReportsFor(user, canUse) {
  return reports.filter(report => canUse(user, report));
}

function publicReport(report) {
  return {
    id: report.id,
    label: report.label,
    screenRoute: report.screenRoute,
    apiRoute: report.apiRoute,
    exportRoute: report.exportRoute,
    formats: report.formats,
    readOnly: true
  };
}

module.exports = { allowedReportsFor, findReport, publicReport };
