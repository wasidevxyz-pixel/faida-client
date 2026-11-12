const mongoose = require('mongoose');
require('dotenv').config({ path: './Backend/.env' });

const Group = require('./Backend/models/Group');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/BAS')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const closingGroup = await Group.findOne({ name: 'Closing' });
    if (closingGroup) {
      console.log('✓ Found Closing group');
      console.log('Current rights keys:', Object.keys(closingGroup.rights || {}));
      
      // Add the missing monthly_payroll permission
      closingGroup.rights.set('monthly_payroll', true);
      await closingGroup.save();
      
      console.log('\n✅ SUCCESS: Added "monthly_payroll" permission to Closing group');
      console.log('Updated rights keys:', Array.from(closingGroup.rights.keys()));
    } else {
      console.log('❌ Closing group not found');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
