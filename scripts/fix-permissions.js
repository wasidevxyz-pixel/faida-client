/**
 * PERMISSION FIX SCRIPT
 * 
 * Automatically assigns users without groups to appropriate groups.
 * 
 * Usage:
 *   node scripts/fix-permissions.js
 * 
 * This is SAFE and will:
 * 1. Find non-admin users without a group
 * 2. Assign them to a "Default User Group" based on their role
 * 3. Report what was fixed
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../Backend/models/User');
const Group = require('../Backend/models/Group');

async function fixPermissions() {
    console.log('\n' + '='.repeat(70));
    console.log('PERMISSION FIX SCRIPT');
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

        // Step 1: Check for default groups
        console.log('Step 1: Checking for default groups...');
        const defaultGroups = {
            'Sales': 'Sales Group',
            'Sales Manager': 'Sales Manager Group',
            'Accounts': 'Accounts Group',
            'Manager': 'Manager Group',
        };

        let usedGroup = null;
        for (const [key, displayName] of Object.entries(defaultGroups)) {
            const group = await Group.findOne({ name: { $regex: displayName, $options: 'i' } }).maxTimeMS(30000);
            if (group) {
                console.log(`   ✅ Found: ${displayName}`);
                usedGroup = group._id;
                break;
            }
        }

        if (!usedGroup) {
            console.log('⚠️  No default group found. Creating one...');
            
            // Create a default group with basic permissions
            const defaultGroup = new Group({
                name: 'Default User Group',
                description: 'Default group for users without explicit group assignment',
                rights: {
                    'employees': false,
                    'employee_registration': false,
                    'attendance': true,
                    'employee_advance': true,
                    'monthly_payroll': false,
                    'new_sale': true,
                    'sale_returns': true,
                    'new_purchase': false,
                    'purchase_returns': false,
                    'payments': true,
                    'vouchers': true,
                    'stocks': true,
                    'items': true,
                }
            });

            await defaultGroup.save();
            usedGroup = defaultGroup._id;
            console.log(`   ✅ Created: Default User Group`);
        }

        console.log();

        // Step 2: Find users without groups
        console.log('Step 2: Finding non-admin users without group...');
        const usersWithoutGroup = await User.find({
            role: { $ne: 'admin' },
            groupId: null
        }).maxTimeMS(30000);

        console.log(`   Found: ${usersWithoutGroup.length} users\n`);

        if (usersWithoutGroup.length === 0) {
            console.log('✅ All users already have groups assigned!\n');
            mongoose.connection.close();
            return;
        }

        // Step 3: Assign groups
        console.log('Step 3: Assigning groups to users...\n');
        
        const updateResult = await User.updateMany(
            {
                role: { $ne: 'admin' },
                groupId: null
            },
            {
                $set: { groupId: usedGroup }
            },
            { maxTimeMS: 30000 }
        );

        console.log(`✅ Updated ${updateResult.modifiedCount} users\n`);

        // Step 4: Verify
        console.log('Step 4: Verifying assignment...');
        const stillWithoutGroup = await User.countDocuments({
            role: { $ne: 'admin' },
            groupId: null
        }).maxTimeMS(30000);

        if (stillWithoutGroup === 0) {
            console.log('✅ Verification passed - All users now have groups!\n');
        } else {
            console.log(`⚠️  Warning: ${stillWithoutGroup} users still without groups\n`);
        }

        // Step 5: Summary
        console.log('='.repeat(70));
        console.log('SUMMARY');
        console.log('='.repeat(70));
        console.log(`
Users Fixed: ${updateResult.modifiedCount}
Group Used: ${usedGroup}
Status: ${updateResult.modifiedCount > 0 ? '✅ SUCCESS' : 'ℹ️  NO ACTION NEEDED'}
`);

    } catch (error) {
        console.error('❌ Error during fix:', error.message);
        console.error(error);
    } finally {
        mongoose.connection.close();
        console.log('Disconnected from MongoDB\n');
    }
}

// Run fix
fixPermissions();
