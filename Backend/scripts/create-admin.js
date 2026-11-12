require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB');

        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || '12345';

        console.log(`\nLooking for user: ${adminEmail}`);
        
        let adminUser = await User.findOne({ email: adminEmail });
        
        if (!adminUser) {
            // Create new admin user
            adminUser = await User.create({
                name: 'Administrator',
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                isActive: true
            });
            console.log(`✓ Created new admin user: ${adminEmail}`);
        } else {
            // Update existing admin user password
            console.log(`✓ Admin user found: ${adminEmail}`);
            adminUser.password = adminPassword;
            adminUser.role = 'admin';
            adminUser.isActive = true;
            await adminUser.save();
            console.log(`✓ Updated password for admin user: ${adminEmail}`);
        }

        console.log('\n=================================');
        console.log('Admin User Credentials:');
        console.log('=================================');
        console.log(`Username: ${adminEmail}`);
        console.log(`Password: ${adminPassword}`);
        console.log(`Role: admin`);
        console.log('=================================\n');

        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createAdmin();
