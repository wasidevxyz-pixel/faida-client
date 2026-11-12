/**
 * GROUP PERMISSIONS AUDIT & SETUP GUIDE
 * 
 * This script shows:
 * 1. All available permissions in the system
 * 2. Current permissions for any group
 * 3. How to create a new group with custom permissions
 */

require('dotenv').config({ path: './Backend/.env' });
const mongoose = require('mongoose');
const Group = require('./Backend/models/Group');

// All available permissions in the sidebar
const ALL_AVAILABLE_PERMISSIONS = {
    'Dashboard & Home': [
        'dashboard',
        'hr_dashboard',
        'food_invoice'
    ],
    'Administration': [
        'administration',
        'users',
        'groups',
        'system_logs',
        'actions_tracker_link',
        'stores',
        'parties',
        'commission_item',
        'wht_supplier_link'
    ],
    'Accounts & Banking': [
        'accounts',
        'pv_supplier',
        'pv_supplier_list',
        'pv_category',
        'pv_category_list',
        'vouchers',
        'expenses',
        'account_register',
        'account_groups',
        'account_categories',
        'closing',
        'branch_departments',
        'daily_cash',
        'cash_counter',
        'closing_sheet',
        'zakat_entry',
        'bank_mgmt',
        'banks',
        'bank_management'
    ],
    'Warehouse': [
        'warehouse',
        'wh_supplier',
        'wh_customer',
        'wh_item',
        'wh_purchase',
        'wh_purchase_return',
        'wh_sale',
        'wh_sale_return',
        'wh_customer_payment',
        'wh_barcode_print',
        'wh_stock_audit'
    ],
    'Payroll': [
        'payroll',
        'legacy_payroll_archive',
        'employee_registration',
        'attendance',
        'employee_advance',
        'monthly_payroll',
        'holy_days',
        'employee_penalty',
        'emp_commission',
        'ug_emp_commission',
        'emp_clearance',
        'emp_adjustment'
    ],
    'Sales': [
        'sales',
        'customer_demand',
        'new_sale',
        'sale_returns',
        'customer_receipt',
        'sales_reports',
        'sales_report_link',
        'sales_comparison_link',
        'date_wise_sales_link',
        'payment_reports_link',
        'dept_sale_link',
        'cash_counter_rpt_link',
        'receipts_link',
        'party_stmt_link'
    ],
    'Purchase': [
        'purchase',
        'new_purchase',
        'purchase_returns',
        'supplier_payment',
        'supplier_wh_tax_link',
        'exemption_invoices_link'
    ],
    'Stock': [
        'stock',
        'stock_adjustments'
    ],
    'Reports': [
        'reports',
        'warehouse_sales_reports',
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
        'employee_attendance_report',
        'overtime_shorttime_report',
        'short_week_report_link',
        'financial_reports',
        'wh_stock_audit'
    ],
    'Settings': [
        'settings',
        'settings_company',
        'settings_invoice',
        'settings_tax',
        'settings_backup',
        'settings_apiKey'
    ]
};

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        const command = process.argv[2];

        if (command === 'list-perms') {
            showAllPermissions();
        } else if (command === 'show-group') {
            const groupName = process.argv[3];
            if (!groupName) {
                console.error('Usage: node group-permissions-audit.js show-group <GroupName>');
                process.exit(1);
            }
            await showGroupPermissions(groupName);
        } else if (command === 'create-custom') {
            const groupName = process.argv[3];
            const permissions = process.argv.slice(4);
            if (!groupName || permissions.length === 0) {
                console.error('Usage: node group-permissions-audit.js create-custom <GroupName> <perm1> <perm2> ...');
                console.error('\nExample:');
                console.error('  node group-permissions-audit.js create-custom Customs sales_report_link');
                console.error('  node group-permissions-audit.js create-custom "Customs Officer" dept_sale_link wh_customer');
                process.exit(1);
            }
            await createCustomGroup(groupName, permissions);
        } else {
            showUsage();
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

function showUsage() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║         GROUP PERMISSIONS AUDIT & SETUP GUIDE                 ║
╚════════════════════════════════════════════════════════════════╝

COMMANDS:
  1. List all available permissions:
     node group-permissions-audit.js list-perms

  2. Show current permissions for a group:
     node group-permissions-audit.js show-group <GroupName>
     Example: node group-permissions-audit.js show-group Tax

  3. Create a new custom group with specific permissions:
     node group-permissions-audit.js create-custom <GroupName> <perm1> <perm2> ...
     
     Example 1 - Customs with only sales report:
     node group-permissions-audit.js create-custom Customs sales_report_link

     Example 2 - Warehouse Officer with warehouse and reporting:
     node group-permissions-audit.js create-custom "Warehouse Officer" wh_supplier wh_customer warehouse_reports

     Example 3 - Payroll User with only payroll screen:
     node group-permissions-audit.js create-custom "Payroll User" monthly_payroll payroll

TIPS:
  • Use list-perms to see all available permission codes
  • When creating a group, ONLY include permissions you want visible
  • Users in that group will see ONLY those screens in the sidebar
  • After creating a group, assign users to it from User Groups page

    `);
}

function showAllPermissions() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         ALL AVAILABLE PERMISSIONS IN THE SYSTEM               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    Object.entries(ALL_AVAILABLE_PERMISSIONS).forEach(([category, perms]) => {
        console.log(`📦 ${category.toUpperCase()}`);
        perms.forEach(perm => {
            console.log(`   • ${perm}`);
        });
        console.log();
    });
}

async function showGroupPermissions(groupName) {
    const group = await Group.findOne({ name: groupName });

    if (!group) {
        console.error(`✗ Group "${groupName}" not found!`);
        return;
    }

    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║         PERMISSIONS FOR GROUP: ${groupName.padEnd(42)}║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const rightsObj = {};
    if (group.rights instanceof Map) {
        for (const [key, value] of group.rights.entries()) {
            rightsObj[key] = value;
        }
    } else {
        Object.assign(rightsObj, group.rights);
    }

    const enabled = Object.entries(rightsObj)
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key)
        .sort();

    console.log(`✓ ENABLED PERMISSIONS (${enabled.length} total):\n`);
    if (enabled.length === 0) {
        console.log('   (None - this group has no permissions)');
    } else {
        enabled.forEach(perm => {
            console.log(`   ✓ ${perm}`);
        });
    }

    console.log(`\n✗ DISABLED PERMISSIONS (${Object.keys(rightsObj).length - enabled.length} total):\n`);
    Object.entries(rightsObj)
        .filter(([_, value]) => value !== true)
        .map(([key, _]) => key)
        .sort()
        .forEach(perm => {
            console.log(`   ✗ ${perm}`);
        });

    console.log();
}

async function createCustomGroup(groupName, permissionList) {
    // Check if group already exists
    let group = await Group.findOne({ name: groupName });
    if (group) {
        console.error(`✗ Group "${groupName}" already exists!`);
        return;
    }

    // Validate permissions
    const allPerms = Object.values(ALL_AVAILABLE_PERMISSIONS).flat();
    const invalidPerms = permissionList.filter(p => !allPerms.includes(p));

    if (invalidPerms.length > 0) {
        console.error(`\n✗ Invalid permissions: ${invalidPerms.join(', ')}`);
        console.error('Run: node group-permissions-audit.js list-perms\n');
        return;
    }

    // Create group with rights
    const rights = new Map();
    permissionList.forEach(perm => {
        rights.set(perm, true);
    });

    group = new Group({
        name: groupName,
        description: `Custom group with ${permissionList.length} permission(s)`,
        rights: rights,
        isAdmin: false
    });

    await group.save();

    console.log(`\n✓ GROUP CREATED SUCCESSFULLY!\n`);
    console.log(`Group Name: ${groupName}`);
    console.log(`Permissions Enabled: ${permissionList.length}`);
    console.log(`\nPermissions:\n`);
    permissionList.forEach(p => console.log(`   ✓ ${p}`));
    console.log(`\n👉 Next Steps:`);
    console.log(`   1. Go to User Groups page in the application`);
    console.log(`   2. You should see the new "${groupName}" group listed`);
    console.log(`   3. Click "Edit" and verify the permissions are correct`);
    console.log(`   4. Go to User Management`);
    console.log(`   5. Assign users to the "${groupName}" group`);
    console.log(`   6. Ask users to log out and log back in`);
    console.log(`   7. They will only see the permitted screens\n`);
}

main();
