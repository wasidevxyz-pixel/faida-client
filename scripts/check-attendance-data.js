const mongoose = require('mongoose');
const uri = 'mongodb://localhost:27017/BAS-SOFTWARE';

async function checkAttendanceData() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const attendanceCollection = db.collection('attendances');
    
    // Get count
    const count = await attendanceCollection.countDocuments();
    console.log(`Total attendance records: ${count}\n`);
    
    // Get sample record
    const record = await attendanceCollection.findOne({});
    
    if (record) {
      console.log('Sample Attendance Record:');
      console.log(JSON.stringify(record, null, 2));
      
      // Check date format
      console.log('\n\nDate Field Info:');
      console.log('Date field type:', typeof record.date);
      console.log('Date value:', record.date);
      
      // Check all branches
      const branches = await attendanceCollection.distinct('branch');
      console.log('\n\nAvailable Branches:');
      branches.forEach(b => console.log(`  - ${b}`));
    } else {
      console.log('No attendance records found!');
    }
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAttendanceData();
