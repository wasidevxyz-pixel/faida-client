require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function verifyAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const user = await User.findOne({ email: adminEmail });

        if (user) {
            console.log('=================================');
            console.log('Admin User Found:');
            console.log('=================================');
            console.log(`Name: ${user.name}`);
            console.log(`Email/Username: ${user.email}`);
            console.log(`Role: ${user.role}`);
            console.log(`Active: ${user.isActive}`);
            console.log(`Created: ${user.createdAt}`);
            console.log('=================================');
            console.log('\n✓ Admin user exists and is ready to use!');
        } else {
            console.log(`❌ Admin user not found: ${adminEmail}`);
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

verifyAdmin();
