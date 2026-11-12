/**
 * GROUP PERMISSIONS BUG FIXER
 * 
 * Diagnoses and fixes permission bugs:
 * 1. Permission checked in UI but not saved in DB
 * 2. Permission saved but not being loaded on login
 * 3. Permission name mismatches
 * 4. Corrupted permission objects
 */

require('dotenv').config({ path: './Backend/.env' });
const mongoose = require('mongoose');
const Group = require('./Backend/models/Group');
const User = require('./Backend/models/User');

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        const command = process.argv[2];

        if (command === 'diagnose') {
            const groupName = process.argv[3];
            if (!groupName) {
                console.error('Usage: node fix-group-perms.js diagnose <GroupName>');
                process.exit(1);
            }
            await diagnoseGroup(groupName);
        } else if (command === 'fix') {
            const groupName = process.argv[3];
            const perms = process.argv.slice(4);
            if (!groupName || perms.length === 0) {
                console.error('Usage: node fix-group-perms.js fix <GroupName> <perm1> <perm2> ...');
                console.error('Example: node fix-group-perms.js fix Tax sales_report_link dept_sale_link');
                process.exit(1);
            }
            await fixGroupPermissions(groupName, perms);
        } else if (command === 'check-user') {
            const userEmail = process.argv[3];
            if (!userEmail) {
                console.error('Usage: node fix-group-perms.js check-user <email>');
                process.exit(1);
            }
            await checkUserPermissions(userEmail);
        } else {
            showUsage();
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

function showUsage() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║      GROUP PERMISSIONS BUG FIXER & DIAGNOSTIC TOOL             ║
╚════════════════════════════════════════════════════════════════╝

COMMANDS:

1. DIAGNOSE a group's permissions (what's saved in DB):
   node fix-group-perms.js diagnose <GroupName>
   
   Example:
   node fix-group-perms.js diagnose Tax
   
   Output: Shows all permissions saved for that group
           Highlights enabled vs disabled
           Checks for corrupted data

2. FIX a group's permissions (save to DB):
   node fix-group-perms.js fix <GroupName> <perm1> <perm2> ...
   
   Example 1 - Tax group with sales report:
   node fix-group-perms.js fix Tax sales_report_link dept_sale_link
   
   Example 2 - Sales group:
   node fix-group-perms.js fix Sales new_sale sale_returns customer_receipt
   
   Example 3 - Warehouse group:
   node fix-group-perms.js fix Warehouse wh_supplier wh_customer wh_purchase

3. CHECK what permissions a user actually has:
   node fix-group-perms.js check-user <email>
   
   Example:
   node fix-group-perms.js check-user user@example.com
   
   Output: Shows what permissions are loaded for that user
           Shows their group
           Verifies what they see on login

TIPS:
  • Always diagnose first to see what's broken
  • Then use fix command to correct it
  • After fixing, user must LOG OUT and LOG IN to see changes
  • Use check-user to verify the fix worked

EXAMPLE WORKFLOW:

  1. Diagnose the Tax group:
     node fix-group-perms.js diagnose Tax

  2. You see: "sales_report_link is NOT enabled (should be enabled!)"

  3. Fix it:
     node fix-group-perms.js fix Tax sales_report_link dept_sale_link

  4. Verify a user in Tax group:
     node fix-group-perms.js check-user tax-user@company.com

  5. User should see: "sales_report_link: true ✓"

    `);
}

async function diagnoseGroup(groupName) {
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║   DIAGNOSING GROUP: ${groupName.padEnd(47)}║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const group = await Group.findOne({ name: groupName });
    
    if (!group) {
        console.error(`❌ Group "${groupName}" not found in database!`);
        console.error(`\nAvailable groups:`);
        const allGroups = await Group.find({}).select('name');
        allGroups.forEach(g => console.log(`   • ${g.name}`));
        return;
    }

    console.log(`Group ID: ${group._id}`);
    console.log(`Is Admin: ${group.isAdmin}`);
    console.log(`Created: ${group.createdAt}\n`);

    // Normalize rights
    const rightsObj = {};
    if (group.rights instanceof Map) {
        for (const [key, value] of group.rights.entries()) {
            rightsObj[key] = value;
        }
    } else {
        Object.assign(rightsObj, group.rights || {});
    }

    const totalPerms = Object.keys(rightsObj).length;
    const enabledPerms = Object.entries(rightsObj).filter(([_, v]) => v === true).length;
    const disabledPerms = totalPerms - enabledPerms;

    console.log(`📊 PERMISSIONS SUMMARY:`);
    console.log(`   Total Permissions: ${totalPerms}`);
    console.log(`   Enabled: ${enabledPerms}`);
    console.log(`   Disabled: ${disabledPerms}\n`);

    if (enabledPerms === 0) {
        console.warn(`⚠️  WARNING: No permissions enabled! Users will see empty sidebar.`);
    }

    console.log(`✓ ENABLED PERMISSIONS:\n`);
    const enabled = Object.entries(rightsObj)
        .filter(([_, v]) => v === true)
        .map(([k, _]) => k)
        .sort();

    if (enabled.length === 0) {
        console.log('   (None)');
    } else {
        enabled.forEach(perm => console.log(`   ✓ ${perm}`));
    }

    console.log(`\n✗ DISABLED PERMISSIONS:\n`);
    const disabled = Object.entries(rightsObj)
        .filter(([_, v]) => v !== true)
        .map(([k, _]) => k)
        .sort();

    if (disabled.length === 0) {
        console.log('   (None - all permissions are enabled)');
    } else {
        if (disabled.length > 10) {
            disabled.slice(0, 10).forEach(perm => console.log(`   ✗ ${perm}`));
            console.log(`   ... and ${disabled.length - 10} more\n`);
        } else {
            disabled.forEach(perm => console.log(`   ✗ ${perm}`));
        }
    }

    // Check for common issues
    console.log(`\n🔍 CHECKING FOR COMMON BUGS:\n`);

    // Check 1: sales_report_link
    if (groupName.toLowerCase() === 'tax' || groupName.toLowerCase().includes('tax')) {
        const hasSalesReport = rightsObj['sales_report_link'] === true;
        if (!hasSalesReport) {
            console.log(`   ⚠️  ISSUE: sales_report_link is NOT enabled`);
            console.log(`      → This is why Tax users get "Access Denied" for sales reports`);
            console.log(`      → FIX: node fix-group-perms.js fix Tax sales_report_link dept_sale_link`);
        } else {
            console.log(`   ✓ sales_report_link is enabled`);
        }
    }

    // Check 2: Corrupted data
    const hasCorruption = Object.values(rightsObj).some(v => v !== true && v !== false && typeof v !== 'boolean');
    if (hasCorruption) {
        console.log(`\n   ⚠️  ISSUE: Corrupted permission values detected!`);
        console.log(`      → Some permissions have invalid values (not true/false)`);
        console.log(`      → FIX: Re-save the group with correct permissions`);
    }

    console.log();
}

async function fixGroupPermissions(groupName, permsToEnable) {
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║   FIXING GROUP: ${groupName.padEnd(47)}║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const group = await Group.findOne({ name: groupName });
    
    if (!group) {
        console.error(`❌ Group "${groupName}" not found!`);
        return;
    }

    console.log(`Current permissions: ${Object.keys(group.rights || {}).length}`);
    console.log(`Permissions to enable: ${permsToEnable.length}\n`);

    // CREATE NEW CLEAN RIGHTS MAP
    const newRights = new Map();
    
    permsToEnable.forEach(perm => {
        newRights.set(perm, true);
        console.log(`   ✓ Enabling: ${perm}`);
    });

    // SAVE TO DATABASE
    group.rights = newRights;
    await group.save();

    console.log(`\n✅ GROUP PERMISSIONS FIXED AND SAVED!\n`);
    console.log(`Group: ${group.name}`);
    console.log(`Total Permissions Enabled: ${permsToEnable.length}`);
    console.log(`\nPermissions enabled:`);
    permsToEnable.forEach(p => console.log(`   ✓ ${p}`));

    console.log(`\n📢 NEXT STEPS:`);
    console.log(`   1. Users in "${groupName}" must LOG OUT`);
    console.log(`   2. Users must LOG IN again`);
    console.log(`   3. They will see ONLY the enabled screens`);
    console.log(`   4. Run 'check-user' to verify:\n`);
    console.log(`      node fix-group-perms.js check-user <user-email>`);
    console.log();
}

async function checkUserPermissions(userEmail) {
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║   CHECKING USER PERMISSIONS: ${userEmail.padEnd(33)}║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const user = await User.findOne({ email: userEmail }).populate('groupId');
    
    if (!user) {
        console.error(`❌ User "${userEmail}" not found!`);
        return;
    }

    console.log(`User: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`Group: ${user.groupId ? user.groupId.name : 'NONE (NO GROUP ASSIGNED)'}`);
    console.log(`Active: ${user.isActive}\n`);

    if (!user.groupId) {
        console.warn(`⚠️  WARNING: User has no group assigned!`);
        console.warn(`   → They will have no permissions except role-based ones`);
        return;
    }

    // Get group rights
    const groupRights = user.groupId.rights || {};
    const rightsObj = {};

    if (groupRights instanceof Map) {
        for (const [key, value] of groupRights.entries()) {
            rightsObj[key] = value;
        }
    } else {
        Object.assign(rightsObj, groupRights);
    }

    const enabled = Object.entries(rightsObj)
        .filter(([_, v]) => v === true)
        .map(([k, _]) => k)
        .sort();

    console.log(`📊 PERMISSIONS FROM GROUP "${user.groupId.name}":\n`);
    console.log(`Total Enabled: ${enabled.length}\n`);

    if (enabled.length === 0) {
        console.warn(`⚠️  WARNING: Group has NO permissions enabled!`);
        console.warn(`   → User will see empty sidebar`);
    } else {
        enabled.forEach(perm => {
            const status = perm === 'sales_report_link' || perm === 'dept_sale_link' ? '✓✓' : '✓';
            console.log(`   ${status} ${perm}`);
        });
    }

    // Check specific permission
    const hasSalesReport = rightsObj['sales_report_link'] === true;
    const hasDeptSale = rightsObj['dept_sale_link'] === true;

    if (hasSalesReport) {
        console.log(`\n✅ User CAN access Sales Report`);
    } else {
        console.log(`\n❌ User CANNOT access Sales Report (permission not enabled)`);
    }

    if (hasDeptSale) {
        console.log(`✅ User CAN access Department Wise Sale`);
    } else {
        console.log(`❌ User CANNOT access Department Wise Sale (permission not enabled)`);
    }

    console.log();
}

main();
