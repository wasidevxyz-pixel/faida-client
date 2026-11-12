const { MongoClient, BSON } = require('mongodb');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = 'C:\\Users\\WASEEM\\Downloads\\backup-auto-2026-05-03\\BAS-SOFTWARE';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';
const DB_NAME = 'BAS-SOFTWARE';

async function importBackup() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB at localhost:27017');
    
    const db = client.db(DB_NAME);
    
    // Get all BSON files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.bson'))
      .sort();
    
    console.log(`\n📦 Found ${files.length} collections to import\n`);
    
    let totalDocuments = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      const collectionName = file.replace('.bson', '');
      const filePath = path.join(BACKUP_DIR, file);
      
      try {
        // Read BSON file
        const bsonData = fs.readFileSync(filePath);
        
        // Parse BSON data - each document is a BSON-encoded object
        const documents = [];
        let offset = 0;
        
        while (offset < bsonData.length) {
          try {
            // Read the size of the next document (first 4 bytes, little-endian)
            if (offset + 4 > bsonData.length) break;
            
            const docSize = bsonData.readUInt32LE(offset);
            
            // Validate size
            if (docSize < 5 || docSize > bsonData.length - offset) break;
            
            // Extract and deserialize the document
            const docBuffer = bsonData.subarray(offset, offset + docSize);
            const doc = BSON.deserialize(docBuffer);
            documents.push(doc);
            
            offset += docSize;
          } catch (e) {
            break;
          }
        }
        
        if (documents.length > 0) {
          // Drop existing collection
          try {
            await db.collection(collectionName).drop();
          } catch (e) {
            // Collection might not exist, that's OK
          }
          
          // Insert documents
          const collection = db.collection(collectionName);
          const result = await collection.insertMany(documents);
          
          console.log(`✓ ${collectionName.padEnd(25)} → ${result.insertedCount.toString().padStart(5)} documents`);
          totalDocuments += result.insertedCount;
          successCount++;
        } else {
          console.log(`⊘ ${collectionName.padEnd(25)} → 0 documents (empty)`);
        }
      } catch (error) {
        console.error(`✗ ${collectionName.padEnd(25)} → ERROR: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n${'='.repeat(55)}`);
    console.log(`✓ Import Complete!`);
    console.log(`  Total Collections: ${files.length}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${errorCount}`);
    console.log(`  Total Documents: ${totalDocuments}`);
    console.log(`${'='.repeat(55)}\n`);
    
  } catch (error) {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

importBackup();
