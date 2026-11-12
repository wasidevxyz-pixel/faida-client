const mongoose = require('mongoose');
require('dotenv').config({ path: './Backend/.env' });

const Group = require('./Backend/models/Group');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/BAS')
  .then(async () => {
    const closingGroup = await Group.findOne({ name: 'Closing' });
    if (closingGroup) {
      console.log('Closing Group Found:');
      console.log('Name:', closingGroup.name);
      console.log('Rights Keys:', Object.keys(closingGroup.rights || {}));
      console.log('Full Rights:', closingGroup.rights);
      
      // Check specific permission
      if (closingGroup.rights) {
        console.log('\n✓ emp_payroll_summary_rpt_link:', closingGroup.rights.get ? closingGroup.rights.get('emp_payroll_summary_rpt_link') : closingGroup.rights['emp_payroll_summary_rpt_link']);
        console.log('✓ monthly_payroll:', closingGroup.rights.get ? closingGroup.rights.get('monthly_payroll') : closingGroup.rights['monthly_payroll']);
      }
    } else {
      console.log('Closing group not found');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
