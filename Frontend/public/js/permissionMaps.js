(function() {
    'use strict';

    if (window.getRequiredPermissionsForPath && window.routePermissionMap) {
        return;
    }

    window.routePermissionMap = {
        // Accounting
        '/accounts': 'accounts',
        '/account-categories': 'account_categories',
        '/account-groups': 'account_groups',
        '/easypaisa-settlement': 'easypaisa_settlement',

        // Attendance
        '/attendance-list': 'attendance',
        '/advance-attendance-reconciliation': ['attendance', 'adv_attendance_reconciliation'],
        '/print-advance-attendance-reconciliation': ['attendance', 'adv_attendance_reconciliation'],
        '/import-attendance': 'attendance',
        '/employee-attendance-detail': 'attendance',
        '/employee-attendance-report': ['attendance', 'emp_attendance_rpt_link'],
        '/overtime-shorttime-report': ['attendance', 'overtime_shorttime_report'],
        '/employee-short-week-report': ['monthly_payroll', 'emp_salary_reports', 'short_week_report_link'],
        '/short-week-report': ['monthly_payroll', 'emp_salary_reports', 'short_week_report_link'],
        '/print-employee-short-week-report': ['monthly_payroll', 'emp_salary_reports', 'short_week_report_link'],
        '/employee-schedule-report': ['attendance', 'emp_schedule_report_link'],

        // Audit Logs
        '/audit-logs': 'audit_logs',

        // Backup
        '/backup': 'administration',

        // Banking
        '/banks': 'banks',
        '/bank-management': 'bank_management',
        '/bank-ledger': ['banks', 'bank_management', 'bank_ledger_link'],
        '/bank-paid-salary-report': ['monthly_payroll', 'bank_paid_salary_rpt_link'],
        '/bank-summary-pro': 'bank_mgmt',
        '/pending-cheque-v2': 'bank_mgmt',

        // Cash
        '/cash-counter': 'cash_counter',
        '/cash-counter-report': ['cash_counter', 'cash_counter_rpt_link'],
        '/cash-paid-salary-report': ['monthly_payroll', 'cash_paid_salary_rpt_link'],
        '/daily-cash': 'daily_cash',
        '/cash-sales': 'new_sale',

        // Customers & Demands
        '/customer-demand': 'customer_demand',
        '/customer-payments': 'customer_receipt',
        '/customer-categories': 'administration',
        '/customer-receipts-report': ['customer_receipt', 'receipts_link'],

        // Closing Sheets
        '/closing-sheet': 'closing_sheet',
        '/closing-sheet-tabs': 'closing_sheet',
        '/print-closing-sheet': 'closing_sheet',

        // Commissions
        '/commission-item': 'commission_item',
        '/commission-supplier': 'commission_item',
        '/commission-category': 'commission_item',
        '/commission-branch': 'commission_item',

        // Companies
        '/companies': 'administration',

        // Classes & Categories
        '/classes': 'administration',
        '/subclasses': 'administration',
        '/categories': 'administration',
        '/item-categories': 'administration',
        '/supplier-categories': 'administration',

        // Departments & Designations
        '/departments': 'branch_departments',
        '/designations': 'employee_registration',
        '/branch-departments': 'branch_departments',

        // Employee Management
        '/employee-list': 'employee_registration',
        '/employee-registration': 'employee_registration',
        '/employee-advance': 'employee_advance',
        '/employee-advance-activity': ['employee_advance', 'employee_advance_activity_rpt_link'],
        '/employee-adjustment': 'emp_adjustment',
        '/employee-commission': 'emp_commission',
        '/distribute-employee-commission': 'distribute_emp_commission',
        '/employee-sale-commission': 'ug_emp_commission',
        '/employee-clearance': 'emp_clearance',
        '/employee-penalty': 'employee_penalty',
        '/employee-increment-report': ['employee_registration', 'emp_increment_rpt_link'],
        '/employee-balances-report': ['employee_registration', 'emp_balances_rpt_link'],
        '/employee-ledger-report': ['employee_registration', 'emp_ledger_rpt_link'],
        '/advance-pay-rec-report': 'advance_pay_rec_rpt_link',

        // Expenses
        '/expenses': 'expenses',
        '/expense-report': ['expenses', 'expense_rpt_link'],

        // Exemption Invoices
        '/exemption-invoices': 'exemption_invoices_link',
        '/exemption-invoices-report': 'exemption_invoices_report_link',

        // Food Invoices
        '/food-invoice': 'food_invoice',

        // Groups & Permissions
        '/groups': 'groups',
        '/check-rights': 'groups',

        // Holy Days
        '/holy-days': 'holy_days',

        // HR Dashboard
        '/hr-dashboard': 'hr_dashboard',
        '/dashboard': 'dashboard',

        // Income Statement
        '/income-statement': 'income_statement_link',

        // Items & Stock
        '/items': 'wh_item',
        '/stores': 'stores',
        '/stock': 'stock',
        '/stock-adjustments': 'stock_adjustments',
        '/stock-audit': 'wh_stock_audit',
        '/stock-report': ['stock', 'stock_rpt_link'],
        '/stock-adjustments-report': 'stock_adj_rpt_link',
        '/stock-position-report': 'wh_stock_position_rpt',
        '/stock-audit-report': ['stock_audit_rpt_link', 'wh_stock_audit'],

        // Ledger Reports
        '/ledger-report': 'ledger_link',
        '/bank-ledger': ['banks', 'bank_management', 'bank_ledger_link'],

        // Legacy Payroll
        '/legacy-payroll': 'legacy_payroll_archive',

        // Parties
        '/parties': 'parties',
        '/suppliers': 'wh_supplier',
        '/supplier-payments': 'supplier_payment',
        '/supplier-tax-certificate': 'supplier_tax_cert_link',
        '/supplier-tax-report': 'supplier_tax_report_link',
        '/supplier-wh-tax': 'supplier_wh_tax_link',

        // Payroll
        '/payroll': 'monthly_payroll',
        '/payroll-report': ['monthly_payroll', 'categorized_branch_report_link'],
        '/print-payroll': 'monthly_payroll',
        '/employee-payroll-list': ['monthly_payroll', 'emp_payroll_list_rpt_link'],
        '/employee-payroll-status': ['monthly_payroll', 'emp_payroll_status_rpt_link'],
        '/employee-payroll-summary-report': ['monthly_payroll', 'emp_payroll_summary_rpt_link'],
        '/employee-salary-detail-report': ['monthly_payroll', 'emp_salary_detail_rpt_link'],
        '/employees-info-report': 'employees_info_report_link',
        '/wh-ded-report': 'wh_ded_report_link',
        '/bank-paid-salary-report': ['monthly_payroll', 'bank_paid_salary_rpt_link'],
        '/cash-paid-salary-report': ['monthly_payroll', 'cash_paid_salary_rpt_link'],
        '/print-employee-payroll-status': ['monthly_payroll', 'emp_payroll_status_rpt_link'],

        // Payments
        '/payments': 'payment_vouchers',
        '/payment-reports': ['payment_vouchers', 'payment_reports_link'],
        '/payment-vouchers': ['payment_vouchers', 'pv_supplier', 'pv_category'],
        '/payment-vouchers-list': ['payment_vouchers', 'pv_supplier', 'pv_category'],
        '/payment-voucher-print': ['payment_vouchers', 'pv_supplier', 'pv_category'],
        '/supplier-voucher': 'pv_supplier',
        '/supplier-voucher-list': ['pv_supplier_list', 'pv_supplier'],
        '/category-voucher': 'pv_category',
        '/category-voucher-list': ['pv_category_list', 'pv_category'],

        // Profit & Loss
        '/profit-loss-report': 'pl_link',

        // Purchases
        '/purchases': 'new_purchase',
        '/purchase-returns': 'purchase_returns',
        '/purchase-report': ['new_purchase', 'purchase_rpt_link'],

        // Receipts
        '/receipts': 'customer_receipt',

        // Reports Hub
        '/reports': 'reports',
        '/sales-report': ['new_sale', 'sales_report_link'],
        '/date-wise-sales-report': ['new_sale', 'date_wise_sales_link'],
        '/sales-comparison-report': ['new_sale', 'sales_comparison_link'],
        '/department-sales-report': ['new_sale', 'dept_sale_link'],
        '/customer-receipts-report': ['customer_receipt', 'receipts_link'],
        '/advance-pay-rec-report': 'advance_pay_rec_rpt_link',
        '/employee-increment-report': ['employee_registration', 'emp_increment_rpt_link'],
        '/employee-balances-report': ['employee_registration', 'emp_balances_rpt_link'],
        '/employee-ledger-report': ['employee_registration', 'emp_ledger_rpt_link'],
        '/overtime-shorttime-report': ['attendance', 'overtime_shorttime_report'],
        '/employee-short-week-report': ['monthly_payroll', 'emp_salary_reports', 'short_week_report_link'],
        '/short-week-report': ['monthly_payroll', 'emp_salary_reports', 'short_week_report_link'],
        '/party-statement-report': 'party_stmt_link',
        '/profit-loss-report': 'pl_link',
        '/stock-position-report': 'wh_stock_position_rpt',
        '/stock-audit-report': ['stock_audit_rpt_link', 'wh_stock_audit'],
        '/wh-customer-ledger-report': 'wh_customer_ledger_rpt',
        '/wh-customer-balance-report': 'wh_customer_balance_rpt',
        '/wh-item-ledger-report': 'wh_item_ledger_rpt',
        '/wh-stock-activity-report': 'wh_stock_activity_rpt',
        '/dept-wise-report': 'dept_wise_report_link',
        '/sub-dept-wise-report': 'sub_dept_wise_report_link',
        '/shop-date-wise-sale-report': 'shop_date_wise_sale_link',
        '/pending-chq-details': 'pending_chq_details_link',
        '/supplier-payments-report': 'supp_pay_link',

        // Sale Routes
        '/sales': 'new_sale',
        '/sale-returns': 'sale_returns',

        // Settings
        '/settings': 'settings',

        // Sub-Branch
        '/sub-branches': 'administration',

        // Taxes & Zakats
        '/taxes': 'administration',
        '/zakats': 'zakat_entry',

        // Units
        '/units': 'administration',

        // Users
        '/users': 'users',

        // Vouchers
        '/vouchers': 'vouchers',
        '/voucher': 'vouchers',
        '/vouchers-report': ['vouchers', 'pv_supplier_rpt_link', 'pv_category_rpt_link'],
        '/voucher-print': ['vouchers', 'expenses'],

        // Warehouse Routes (WH)
        '/wh-customer': 'wh_customer',
        '/wh-customer-payment': 'wh_customer_payment',
        '/wh-item': 'wh_item',
        '/wh-purchase': 'wh_purchase',
        '/wh-purchase-return': 'wh_purchase_return',
        '/wh-sale': 'wh_sale',
        '/wh-sale-return': 'wh_sale_return',
        '/wh-supplier': 'wh_supplier',
        '/wh-barcode': 'wh_barcode_print',
        '/wh-stock-audit': 'wh_stock_audit',
        '/wh-print': ['wh_sale', 'wh_sale_return', 'wh_purchase', 'wh_purchase_return', 'wh_stock_audit']
    };

    window.getRequiredPermissionsForPath = function(path) {
        if (!path || typeof path !== 'string') return null;
        const normalizedPath = path.toLowerCase();

        for (const [pattern, permission] of Object.entries(window.routePermissionMap)) {
            if (normalizedPath === pattern || normalizedPath.startsWith(pattern + '/')) {
                return permission;
            }
        }
        return null;
    };
})();
