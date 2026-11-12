const mongoose = require('mongoose');
require('dotenv').config({ path: './Backend/.env' });

const Group = require('./Backend/models/Group');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/BAS');
    console.log('Connected to MongoDB');

    const closingGroup = await Group.findOne({ name: 'Closing' });
    if (!closingGroup) {
      console.error('Closing group not found');
      process.exit(1);
    }

    console.log('Current rights keys:', Object.keys(closingGroup.rights || {}));

    // Remove payroll-related rights
    if (closingGroup.rights) {
      if (closingGroup.rights.get) {
        closingGroup.rights.delete('monthly_payroll');
        closingGroup.rights.delete('payroll');
      } else {
        delete closingGroup.rights['monthly_payroll'];
        delete closingGroup.rights['payroll'];
      }
    }

    await closingGroup.save();
    console.log('\n✅ SUCCESS: Removed payroll permissions from Closing group');
    console.log('Updated rights keys:', Object.keys(closingGroup.rights || {}));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
