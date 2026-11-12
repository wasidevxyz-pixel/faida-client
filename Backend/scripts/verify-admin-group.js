require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

async function verifyAdminGroup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Find Admin Group
        const adminGroup = await Group.findOne({ name: 'Administrators' });

        if (!adminGroup) {
            console.log('❌ Admin group not found!');
            process.exit(1);
        }

        console.log('=================================');
        console.log('Admin Group Found:');
        console.log('=================================');
        console.log(`Name: ${adminGroup.name}`);
        console.log(`Description: ${adminGroup.description}`);
        console.log(`Is Admin: ${adminGroup.isAdmin}`);
        console.log(`Created: ${adminGroup.createdAt}`);

        // Convert Map to Object for display
        let rightsObj = {};
        if (adminGroup.rights instanceof Map) {
            adminGroup.rights.forEach((value, key) => {
                rightsObj[key] = value;
            });
        } else {
            rightsObj = adminGroup.rights;
        }

        const rightsCount = Object.keys(rightsObj).length;
        console.log(`Total Rights: ${rightsCount}`);
        console.log('=================================\n');

        // Find users with this group
        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const user = await User.findOne({ email: adminEmail }).populate('groupId');

        if (user) {
            console.log('=================================');
            console.log('Admin User Details:');
            console.log('=================================');
            console.log(`Name: ${user.name}`);
            console.log(`Email: ${user.email}`);
            console.log(`Role: ${user.role}`);
            console.log(`Active: ${user.isActive}`);

            if (user.groupId) {
                console.log(`Group: ${user.groupId.name}`);
                console.log(`Group Is Admin: ${user.groupId.isAdmin}`);
                console.log('✅ Admin user is correctly linked to Admin Group!');
            } else {
                console.log('⚠ No group assigned to admin user');
            }
            console.log('=================================\n');
        } else {
            console.log(`❌ Admin user not found: ${adminEmail}\n`);
        }

        // Display all rights
        console.log('All Rights Granted:');
        console.log('=================================');
        const sortedRights = Object.keys(rightsObj).sort();
        sortedRights.forEach((right, index) => {
            console.log(`${(index + 1).toString().padStart(3, ' ')}. ${right}: ${rightsObj[right]}`);
        });
        console.log('=================================\n');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

verifyAdminGroup();
