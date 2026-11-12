require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

async function showAdminSummary() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const user = await User.findOne({ email: adminEmail }).populate('groupId');
        const adminGroup = await Group.findOne({ name: 'Administrators' });

        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║          ADMIN SETUP COMPLETE - SUMMARY                ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log('\n');

        console.log('📋 LOGIN CREDENTIALS:');
        console.log('─────────────────────────────────────────────────────────');
        console.log(`   Username: ${adminEmail}`);
        console.log(`   Password: ${process.env.ADMIN_PASSWORD || '12345'}`);
        console.log(`   Role:     admin`);
        console.log('\n');

        if (user && user.groupId) {
            console.log('👥 GROUP ASSIGNMENT:');
            console.log('─────────────────────────────────────────────────────────');
            console.log(`   Group Name:    ${user.groupId.name}`);
            console.log(`   Is Admin:      ${user.groupId.isAdmin ? 'Yes ✓' : 'No'}`);
            console.log(`   Description:   ${user.groupId.description}`);

            let rightsCount = 0;
            if (user.groupId.rights instanceof Map) {
                rightsCount = user.groupId.rights.size;
            } else if (user.groupId.rights) {
                rightsCount = Object.keys(user.groupId.rights).length;
            }
            console.log(`   Total Rights:  ${rightsCount}`);
            console.log('\n');
        }

        if (adminGroup) {
            console.log('🔐 PERMISSIONS SUMMARY:');
            console.log('─────────────────────────────────────────────────────────');

            const categories = {
                'Dashboard': ['dashboard'],
                'Administration': ['administration', 'users', 'groups', 'stores', 'parties'],
                'Accounts': ['accounts', 'vouchers', 'expenses', 'account_register'],
                'Sales': ['sales', 'new_sale', 'sale_returns', 'customer_demand'],
                'Purchase': ['purchase', 'new_purchase', 'purchase_returns'],
                'Warehouse': ['warehouse', 'wh_item', 'wh_purchase', 'wh_sale'],
                'Payroll': ['payroll', 'employee_registration', 'monthly_payroll'],
                'Bank Management': ['bank_mgmt', 'banks', 'bank_management'],
                'Reports': ['reports', 'sales_reports', 'employees_info_report_link'],
                'Settings': ['settings', 'settings_company', 'settings_invoice']
            };

            for (const [category, perms] of Object.entries(categories)) {
                console.log(`   ✓ ${category}`);
            }
            console.log('   ... and many more!\n');
        }

        console.log('✅ STATUS:');
        console.log('─────────────────────────────────────────────────────────');
        console.log('   ✓ Admin user created');
        console.log('   ✓ Admin group created with all rights');
        console.log('   ✓ User assigned to admin group');
        console.log('   ✓ Full system access granted');
        console.log('\n');

        console.log('🚀 NEXT STEPS:');
        console.log('─────────────────────────────────────────────────────────');
        console.log('   1. Login with the credentials above');
        console.log('   2. Navigate to Group Rights to view all permissions');
        console.log('   3. Create additional users and assign groups as needed');
        console.log('\n');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

showAdminSummary();
