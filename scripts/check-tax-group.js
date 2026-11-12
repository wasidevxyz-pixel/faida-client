/**
 * Diagnostic Script: Check Tax Group Permissions in Database
 * Run this to verify what permissions are actually saved for the Tax group
 */

require('dotenv').config({ path: './Backend/.env' });
const mongoose = require('mongoose');
const Group = require('./Backend/models/Group');

async function checkTaxGroup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✓ Connected to MongoDB\n');

    // Find Tax group
    const taxGroup = await Group.findOne({ name: 'Tax' });

    if (!taxGroup) {
      console.error('✗ Tax group not found!');
      process.exit(1);
    }

    console.log('=== TAX GROUP DETAILS ===\n');
    console.log(`Group Name: ${taxGroup.name}`);
    console.log(`Group ID: ${taxGroup._id}`);
    console.log(`Is Admin: ${taxGroup.isAdmin}`);
    console.log(`\n=== PERMISSIONS (${taxGroup.rights.size} total) ===\n`);

    // Convert Map to object for display
    const rightsObj = {};
    if (taxGroup.rights instanceof Map) {
      for (const [key, value] of taxGroup.rights.entries()) {
        rightsObj[key] = value;
      }
    } else {
      Object.assign(rightsObj, taxGroup.rights);
    }

    // Display all permissions
    Object.entries(rightsObj)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        const status = value === true ? '✓' : '✗';
        console.log(`  ${status} ${key}: ${value}`);
      });

    console.log('\n=== CHECK: sales_report_link ===\n');
    const hasSalesReport = rightsObj['sales_report_link'] === true;
    if (hasSalesReport) {
      console.log('✓ sales_report_link is ENABLED');
    } else {
      console.log('✗ sales_report_link is NOT enabled');
      console.log('\nTo fix: Go to User Groups → Edit Tax → Check "Sales Report" → Save');
    }

    console.log('\n=== ENABLE sales_report_link ===\n');
    // Programmatically enable it if needed
    const shouldEnable = process.argv.includes('--enable');
    if (shouldEnable && !hasSalesReport) {
      taxGroup.rights.set('sales_report_link', true);
      await taxGroup.save();
      console.log('✓ sales_report_link has been ENABLED and saved to database');
    }

    mongoose.connection.close();
    console.log('\n✓ Check complete');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTaxGroup();
