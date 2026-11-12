const mongoose = require('mongoose');
const uri = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function fixAdminPermissions() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB\n');
    
    // Access the groups collection directly
    const db = mongoose.connection.db;
    const groupsCollection = db.collection('groups');
    
    // Find all groups
    const allGroups = await groupsCollection.find({}).toArray();
    console.log('All groups in database:');
    allGroups.forEach(g => {
      console.log(`  - ${g.name || g._id}`);
    });
    
    // Find admin group (try different naming patterns)
    let adminGroup = await groupsCollection.findOne({ name: { $regex: /admin/i } });
    
    if (!adminGroup) {
      console.log('\n❌ Admin group not found');
      console.log('\nAvailable groups:');
      allGroups.forEach((g, i) => {
        console.log(`${i + 1}. ${g.name} - Permissions:`, g.permissions?.length || 0);
      });
      
      // Try to update first group that looks like admin
      const firstGroup = allGroups[0];
      if (firstGroup) {
        console.log(`\nUsing first group: "${firstGroup.name}" as Admin`);
        adminGroup = firstGroup;
      }
    } else {
      console.log(`\n✓ Found Admin group: "${adminGroup.name}"`);
    }
    
    if (adminGroup) {
      // Ensure permissions array exists
      if (!adminGroup.permissions) {
        adminGroup.permissions = [];
      }
      
      // Check if emp_schedule_report_link already exists
      const hasPermission = adminGroup.permissions.includes('emp_schedule_report_link');
      
      if (!hasPermission) {
        // Add the permission
        adminGroup.permissions.push('emp_schedule_report_link');
        
        const result = await groupsCollection.updateOne(
          { _id: adminGroup._id },
          { $set: { permissions: adminGroup.permissions } }
        );
        
        console.log(`\n✓ Added emp_schedule_report_link permission`);
        console.log(`  Updated: ${result.modifiedCount} document(s)`);
      } else {
        console.log(`\n✓ emp_schedule_report_link already exists`);
      }
      
      // Show updated permissions
      console.log(`\nUpdated permissions (${adminGroup.permissions.length} total):`);
      adminGroup.permissions.forEach(p => {
        console.log(`  - ${p}`);
      });
    }
    
    await mongoose.connection.close();
    console.log('\n✓ Done!');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixAdminPermissions();
