const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');

const BACKUP_DIR = path.join(__dirname, '..', 'SAFE_MONGODB_BSON_BACKUP_2026-08-25', 'BAS-SOFTWARE');

function verifyBackup() {
  console.log(`🔍 Scanning backup directory: ${BACKUP_DIR}`);
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`❌ Backup directory not found at ${BACKUP_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.bson'))
    .sort();

  console.log(`📦 Found ${files.length} BSON files. Verifying contents...\n`);
  console.log(`${'Colletion Name'.padEnd(30)} | ${'File Size'.padStart(12)} | ${'Documents Count'.padStart(15)} | Status`);
  console.log('-'.repeat(75));

  let verifiedCount = 0;
  let emptyCount = 0;
  let errorCount = 0;
  let totalDocs = 0;

  for (const file of files) {
    const filePath = path.join(BACKUP_DIR, file);
    const collectionName = file.replace('.bson', '');
    const stats = fs.statSync(filePath);
    const size = stats.size;

    if (size === 0) {
      console.log(`${collectionName.padEnd(30)} | ${'0 B'.padStart(12)} | ${'0'.padStart(15)} | Empty (OK)`);
      emptyCount++;
      continue;
    }

    try {
      const bsonData = fs.readFileSync(filePath);
      let offset = 0;
      let docCount = 0;

      while (offset < bsonData.length) {
        if (offset + 4 > bsonData.length) {
          throw new Error(`Unexpected EOF at offset ${offset}`);
        }
        const docSize = bsonData.readUInt32LE(offset);
        if (docSize < 5 || docSize > bsonData.length - offset) {
          throw new Error(`Invalid document size ${docSize} at offset ${offset}`);
        }
        const docBuffer = bsonData.subarray(offset, offset + docSize);
        BSON.deserialize(docBuffer); // Validate deserialization
        docCount++;
        offset += docSize;
      }

      const sizeStr = size > 1024 * 1024 
        ? `${(size / (1024 * 1024)).toFixed(2)} MB` 
        : `${(size / 1024).toFixed(2)} KB`;

      console.log(`${collectionName.padEnd(30)} | ${sizeStr.padStart(12)} | ${docCount.toString().padStart(15)} | ✓ Valid`);
      totalDocs += docCount;
      verifiedCount++;
    } catch (err) {
      console.log(`${collectionName.padEnd(30)} | ${(size / 1024).toFixed(2).padStart(9)} KB | ${'N/A'.padStart(15)} | ✗ Corrupted: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(75));
  console.log(`Verification Summary:`);
  console.log(`  Total BSON files: ${files.length}`);
  console.log(`  Valid (with data): ${verifiedCount}`);
  console.log(`  Empty files:       ${emptyCount}`);
  console.log(`  Corrupted/Errors:  ${errorCount}`);
  console.log(`  Total Documents:   ${totalDocs}`);
  console.log('='.repeat(75));
}

verifyBackup();
