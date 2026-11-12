const { MongoClient, BSON } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'Backend', '.env') });

const BACKUP_DIR = path.join(__dirname, '..', 'SAFE_MONGODB_BSON_BACKUP_2026-08-25', 'BAS-SOFTWARE');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bas-software';

// Extract database name from connection URI
const urlParts = MONGO_URI.split('/');
const DB_NAME = urlParts[urlParts.length - 1].split('?')[0] || 'bas-software';

async function restoreBackup() {
  console.log(`🚀 Starting MongoDB Restoration`);
  console.log(`📂 Backup Directory: ${BACKUP_DIR}`);
  console.log(`🔗 Target MongoDB URI: ${MONGO_URI}`);
  console.log(`🗄️ Database Name: ${DB_NAME}\n`);

  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`❌ Backup directory not found at ${BACKUP_DIR}`);
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✓ Successfully connected to MongoDB server');
    
    const db = client.db(DB_NAME);
    
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.bson'))
      .sort();
    
    console.log(`📦 Found ${files.length} collections in backup folder.\n`);
    
    let totalDocumentsRestored = 0;
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 1000;
    
    for (const file of files) {
      const collectionName = file.replace('.bson', '');
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (stats.size === 0) {
        console.log(`⊘ ${collectionName.padEnd(25)} → Skip (empty backup file)`);
        continue;
      }
      
      try {
        const bsonData = fs.readFileSync(filePath);
        const documents = [];
        let offset = 0;
        
        while (offset < bsonData.length) {
          if (offset + 4 > bsonData.length) break;
          const docSize = bsonData.readUInt32LE(offset);
          if (docSize < 5 || docSize > bsonData.length - offset) break;
          
          const docBuffer = bsonData.subarray(offset, offset + docSize);
          const doc = BSON.deserialize(docBuffer);
          documents.push(doc);
          
          offset += docSize;
        }
        
        if (documents.length > 0) {
          // Drop existing collection to ensure clean restore
          try {
            await db.collection(collectionName).drop();
          } catch (e) {
            // Collection might not exist, which is fine
          }
          
          const collection = db.collection(collectionName);
          let insertedCount = 0;
          
          // Insert in batches of batchSize to optimize memory and network throughput
          for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);
            const result = await collection.insertMany(batch);
            insertedCount += result.insertedCount;
          }
          
          console.log(`✓ ${collectionName.padEnd(25)} → ${insertedCount.toString().padStart(6)} documents restored`);
          totalDocumentsRestored += insertedCount;
          successCount++;
        }
      } catch (error) {
        console.error(`✗ ${collectionName.padEnd(25)} → ERROR: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n${'='.repeat(65)}`);
    console.log(`🎉 Restoration Completed!`);
    console.log(`  Total Collections Processed: ${files.length}`);
    console.log(`  Successfully Restored:      ${successCount}`);
    console.log(`  Failed Restorations:         ${errorCount}`);
    console.log(`  Total Documents Restored:    ${totalDocumentsRestored}`);
    console.log(`${'='.repeat(65)}\n`);
    
  } catch (error) {
    console.error('❌ Fatal Error during restoration:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

restoreBackup();
