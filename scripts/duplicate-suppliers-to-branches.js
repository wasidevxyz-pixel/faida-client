// Script to duplicate suppliers from one branch to all other branches
// This can be run in MongoDB Compass or via Node.js

const mongoose = require('mongoose');

// MongoDB connection string - UPDATE THIS
const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

// Configuration
const SOURCE_BRANCH = '(Chandni Chowk)'; // Branch to copy suppliers from
const TARGET_BRANCHES = [
    '(PWD-1)',
    '(F-6)',
    '(Ghouri Town)',
    '(Optician ISB)',
    '(Pakistan Town)',
    '(Gujar Khan)',
    '(Giga Mall)',
    '(G15 Markaz)',
    '(Attock)'
    // All branches except Chandni Chowk (source)
];

async function duplicateSuppliersToAllBranches() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const partiesCollection = db.collection('parties');

        // Get all suppliers from source branch
        const sourceSuppliers = await partiesCollection.find({
            branch: SOURCE_BRANCH,
            partyType: 'supplier'
        }).toArray();

        console.log(`Found ${sourceSuppliers.length} suppliers in ${SOURCE_BRANCH}`);

        let totalCreated = 0;

        // For each target branch
        for (const targetBranch of TARGET_BRANCHES) {
            console.log(`\nProcessing branch: ${targetBranch}`);

            // For each supplier
            for (const supplier of sourceSuppliers) {
                // Check if supplier already exists in target branch
                const existingSupplier = await partiesCollection.findOne({
                    name: supplier.name,
                    branch: targetBranch,
                    partyType: 'supplier'
                });

                if (existingSupplier) {
                    console.log(`  - Skipping ${supplier.name} (already exists in ${targetBranch})`);
                    continue;
                }

                // Create new supplier for target branch
                const newSupplier = {
                    ...supplier,
                    _id: new mongoose.Types.ObjectId(), // New ID
                    branch: targetBranch, // New branch
                    code: `${supplier.code.split('-')[0]}-${targetBranch.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`, // New code
                    currentBalance: 0, // Reset balance
                    openingBalance: 0, // Reset opening balance
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Insert new supplier
                await partiesCollection.insertOne(newSupplier);
                console.log(`  ✓ Created ${supplier.name} in ${targetBranch}`);
                totalCreated++;
            }
        }

        console.log(`\n✅ Successfully created ${totalCreated} supplier records across ${TARGET_BRANCHES.length} branches`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
duplicateSuppliersToAllBranches();
