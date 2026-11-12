/**
 * PERMISSION AUDIT SCRIPT
 * 
 * Run this script to check for permission-related issues in the database.
 * Great for diagnosing why users are being denied access.
 * 
 * Usage:
 *   node scripts/audit-permissions.js
 * 
 * Output: Lists users with permission issues and recommendations
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Load models
const User = require('../Backend/models/User');
const Group = require('../Backend/models/Group');

async function auditPermissions() {
    console.log('\n' + '='.repeat(70));
    console.log('PERMISSION AUDIT REPORT');
    console.log('='.repeat(70) + '\n');

    try {
        // Connect to MongoDB with extended timeout for slow connections
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bas', {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 5
        });
        console.log('✅ Connected to MongoDB\n');

        // AUDIT 1: Non-admin users without groupId
        console.log('AUDIT 1: Non-Admin Users Without Group Assignment');
        console.log('-'.repeat(70));
        const usersWithoutGroup = await User.find({
            role: { $ne: 'admin' },
            groupId: null
        }).select('name email role _id').maxTimeMS(30000);

        if (usersWithoutGroup.length === 0) {
            console.log('✅ All non-admin users have a group assigned\n');
        } else {
            console.log(`⚠️  FOUND ${usersWithoutGroup.length} non-admin users without group:\n`);
            usersWithoutGroup.forEach(user => {
                console.log(`   - ${user.email} (${user.name}) [Role: ${user.role}]`);
            });
            console.log('\n📝 RECOMMENDATION: Assign these users to a group with proper permissions.\n');
        }

        // AUDIT 2: Groups with no permissions assigned
        console.log('AUDIT 2: Groups With No Permissions');
        console.log('-'.repeat(70));
        const emptyGroups = await Group.find({
            $or: [
                { rights: { $size: 0 } },
                { rights: null }
            ]
        }).select('name _id isAdmin').maxTimeMS(30000);

        if (emptyGroups.length === 0) {
            console.log('✅ All groups have permissions assigned\n');
        } else {
            console.log(`⚠️  FOUND ${emptyGroups.length} groups with no permissions:\n`);
            emptyGroups.forEach(group => {
                console.log(`   - ${group.name} (Admin: ${group.isAdmin ? 'Yes' : 'No'})`);
            });
            console.log('\n📝 RECOMMENDATION: Add permissions to these groups.\n');
        }

        // AUDIT 3: Count users by role and group
        console.log('AUDIT 3: User Distribution');
        console.log('-'.repeat(70));
        const userStats = await User.aggregate([
            {
                $group: {
                    _id: { role: '$role', hasGroup: { $cond: [{ $ne: ['$groupId', null] }, 'YES', 'NO'] } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.role': 1 } }
        ]).maxTimeMS(30000);

        console.log('\nUser Count by Role & Group Assignment:');
        userStats.forEach(stat => {
            const roleStr = stat._id.role.padEnd(15);
            const hasGroupStr = `Group: ${stat._id.hasGroup}`.padEnd(15);
            console.log(`   ${roleStr} | ${hasGroupStr} | Count: ${stat.count}`);
        });
        console.log();

        // AUDIT 4: Sample permission check for a specific user
        console.log('AUDIT 4: Sample Permission Check');
        console.log('-'.repeat(70));
        const sampleUser = await User.findOne({ role: { $ne: 'admin' } }).populate('groupId').maxTimeMS(30000);
        
        if (sampleUser) {
            console.log(`\nUser: ${sampleUser.email} (Role: ${sampleUser.role})`);
            console.log(`Group: ${sampleUser.groupId ? sampleUser.groupId.name : 'NONE ASSIGNED'}`);
            
            if (sampleUser.groupId && sampleUser.groupId.rights) {
                const rights = sampleUser.groupId.rights;
                const rightsList = rights instanceof Map 
                    ? Array.from(rights.entries())
                    : Object.entries(rights);
                
                const grantedRights = rightsList.filter(([key, val]) => val === true).map(([key]) => key);
                
                if (grantedRights.length === 0) {
                    console.log(`⚠️  Group has NO permissions granted!`);
                } else {
                    console.log(`✅ Permissions (${grantedRights.length}):`);
                    grantedRights.slice(0, 10).forEach(perm => {
                        console.log(`   - ${perm}`);
                    });
                    if (grantedRights.length > 10) {
                        console.log(`   ... and ${grantedRights.length - 10} more`);
                    }
                }
            }
        } else {
            console.log('\nℹ️  No non-admin users found to sample\n');
        }

        // AUDIT 5: Check for critical permissions in groups
        console.log('\nAUDIT 5: Groups with Critical Permissions');
        console.log('-'.repeat(70));
        const groupsWithPayroll = await Group.find({
            'rights.monthly_payroll': true
        }).select('name -_id').maxTimeMS(30000);

        const groupsWithSales = await Group.find({
            'rights.new_sale': true
        }).select('name -_id').maxTimeMS(30000);

        const groupsWithPayments = await Group.find({
            'rights.payments': true
        }).select('name -_id').maxTimeMS(30000);

        console.log(`\nGroups with "monthly_payroll" permission: ${groupsWithPayroll.length}`);
        groupsWithPayroll.slice(0, 5).forEach(g => console.log(`   - ${g.name}`));

        console.log(`\nGroups with "new_sale" permission: ${groupsWithSales.length}`);
        groupsWithSales.slice(0, 5).forEach(g => console.log(`   - ${g.name}`));

        console.log(`\nGroups with "payments" permission: ${groupsWithPayments.length}`);
        groupsWithPayments.slice(0, 5).forEach(g => console.log(`   - ${g.name}`));
        console.log();

        // SUMMARY
        console.log('='.repeat(70));
        console.log('SUMMARY');
        console.log('='.repeat(70));
        const totalUsers = await User.countDocuments().maxTimeMS(30000);
        const adminUsers = await User.countDocuments({ role: 'admin' }).maxTimeMS(30000);
        const nonAdminUsers = totalUsers - adminUsers;
        const nonAdminWithoutGroup = usersWithoutGroup.length;

        console.log(`
Total Users: ${totalUsers}
├─ Admin Users: ${adminUsers} ✅
└─ Non-Admin Users: ${nonAdminUsers}
   ├─ With Group: ${nonAdminUsers - nonAdminWithoutGroup} ✅
   └─ WITHOUT Group: ${nonAdminWithoutGroup} ⚠️

Critical Issues Found: ${nonAdminWithoutGroup + emptyGroups.length}
`);

        if (nonAdminWithoutGroup > 0 || emptyGroups.length > 0) {
            console.log('ACTION REQUIRED: Run the fix script to assign groups to users');
            console.log('  node scripts/fix-permissions.js\n');
        } else {
            console.log('✅ All permission checks passed!\n');
        }

    } catch (error) {
        console.error('❌ Error during audit:', error.message);
    } finally {
        mongoose.connection.close();
        console.log('Disconnected from MongoDB\n');
    }
}

// Run audit
auditPermissions();
