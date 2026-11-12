// Clean name_urdu fields by removing Latin/ASCII characters and keeping Arabic/Urdu letters
// Usage: node scripts/clean_name_urdu.js
// It connects to the same default DB used by the app (mongodb://localhost:27017/sales-inventory)

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const Employee = require(path.join(__dirname, '..', 'Backend', 'models', 'Employee'));

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory';
console.log('Connecting to', mongoUri);

// Regex: keep Arabic/Arabic Supplement/Arabic Extended ranges commonly used for Urdu
const keepRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\u0600-\u06FF]/g;
const stripRegex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g;

(async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const cursor = Employee.find({ name_urdu: { $exists: true, $ne: null, $ne: '' } }).cursor();
    let total = 0, updated = 0, skipped = 0;

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      total++;
      const original = String(doc.name_urdu || '');
      // Remove ASCII/Latin letters, digits, punctuation — keep Urdu/Arabic letters and spaces
      const cleaned = original.replace(stripRegex, '').replace(/\s+/g, ' ').trim();

      // If cleaned is empty, skip (to avoid erasing names that are not Urdu)
      if (!cleaned) {
        skipped++;
        continue;
      }

      // If no change, skip
      if (cleaned === original.trim()) {
        skipped++;
        continue;
      }

      doc.name_urdu = cleaned;
      await doc.save();
      updated++;
      console.log(`Updated ${doc._id}: "${original}" -> "${cleaned}"`);
    }

    console.log(`Done. Total checked: ${total}, Updated: ${updated}, Skipped: ${skipped}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during cleaning:', err);
    process.exit(1);
  }
})();
