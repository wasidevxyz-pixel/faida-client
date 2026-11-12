require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

async function createAdminGroup() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Define all available rights/permissions in the system
        const allRights = {
            // Main/Dashboard
            'dashboard': true,

            // Administration
            'administration': true,
            'users': true,
            'groups': true,
            'stores': true,
            'parties': true,
            'commission_item': true,
            'wht_supplier_link': true,

            // Accounts
            'accounts': true,
            'pv_supplier': true,
            'pv_supplier_list': true,
            'pv_category': true,
            'pv_category_list': true,
            'vouchers': true,
            'expenses': true,
            'account_register': true,
            'account_groups': true,
            'account_categories': true,

            // Closing
            'closing': true,
            'branch_departments': true,
            'daily_cash': true,
            'cash_counter': true,
            'closing_sheet': true,
            'zakat_entry': true,

            // Warehouse
            'warehouse': true,
            'wh_supplier': true,
            'wh_customer': true,
            'wh_item': true,
            'wh_purchase': true,
            'wh_purchase_return': true,
            'wh_sale': true,
            'wh_sale_return': true,
            'wh_customer_payment': true,
            'wh_barcode_print': true,
            'wh_stock_audit': true,

            // Payroll
            'payroll': true,
            'employee_registration': true,
            'attendance': true,
            'employee_advance': true,
            'monthly_payroll': true,
            'holy_days': true,
            'employee_penalty': true,
            'emp_commission': true,
            'ug_emp_commission': true,
            'emp_clearance': true,
            'emp_adjustment': true,

            // Bank Management
            'bank_mgmt': true,
            'bank_management': true,
            'banks': true,

            // Reports
            'reports': true,
            'sales_reports': true,
            'warehouse_sales_reports': true,
            'cash_counter_rpt_link': true,
            'employees_info_report_link': true,

            // Sales
            'sales': true,
            'customer_demand': true,
            'new_sale': true,
            'sale_returns': true,
            'customer_receipt': true,

            // Purchase
            'purchase': true,
            'new_purchase': true,
            'purchase_returns': true,
            'supplier_payment': true,
            'supplier_wh_tax_link': true,
            'exemption_invoices_link': true,

            // Stock
            'stock': true,
            'stock_adjustments': true,

            // Settings
            'settings': true,
            'settings_company': true,
            'settings_invoice': true,
            'settings_tax': true,
            'settings_backup': true,
            'settings_apiKey': true,

            // Additional Rights
            'admin': true,
            'payment_vouchers': true
        };

        console.log(`Total Rights to Grant: ${Object.keys(allRights).length}\n`);

        // Check if Admin Group already exists
        let adminGroup = await Group.findOne({ name: 'Administrators' });

        if (!adminGroup) {
            // Create new Admin Group
            adminGroup = await Group.create({
                name: 'Administrators',
                description: 'Full administrative access to all system features',
                rights: allRights,
                isAdmin: true
            });
            console.log('✓ Created new Admin Group: Administrators');
        } else {
            // Update existing Admin Group
            adminGroup.rights = allRights;
            adminGroup.isAdmin = true;
            adminGroup.description = 'Full administrative access to all system features';
            await adminGroup.save();
            console.log('✓ Updated existing Admin Group: Administrators');
        }

        console.log('\n=================================');
        console.log('Admin Group Details:');
        console.log('=================================');
        console.log(`Name: ${adminGroup.name}`);
        console.log(`Description: ${adminGroup.description}`);
        console.log(`Is Admin: ${adminGroup.isAdmin}`);
        console.log(`Total Rights: ${adminGroup.rights.size || Object.keys(allRights).length}`);
        console.log('=================================\n');

        // Update admin user to use this group
        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const adminUser = await User.findOne({ email: adminEmail });

        if (adminUser) {
            adminUser.groupId = adminGroup._id;
            await adminUser.save();
            console.log(`✓ Assigned Admin Group to user: ${adminEmail}\n`);
        } else {
            console.log(`⚠ Admin user not found: ${adminEmail}`);
            console.log('  Please run create-admin.js first to create the admin user.\n');
        }

        // Display sample of rights
        console.log('Sample Rights Granted:');
        console.log('=================================');
        const sampleRights = ['dashboard', 'administration', 'users', 'groups', 'accounts', 'sales', 'purchase', 'reports', 'settings'];
        sampleRights.forEach(right => {
            console.log(`  ✓ ${right}`);
        });
        console.log(`  ... and ${Object.keys(allRights).length - sampleRights.length} more rights`);
        console.log('=================================\n');

        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        console.log('\n✅ Admin group created successfully with all rights!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

createAdminGroup();
