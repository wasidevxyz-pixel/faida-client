// Script to check what branches exist and their supplier counts
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/bas-software';

async function checkBranches() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB\n');

        const db = mongoose.connection.db;
        const partiesCollection = db.collection('parties');

        // Get all unique branches with supplier counts
        const branches = await partiesCollection.aggregate([
            {
                $match: { partyType: 'supplier' }
            },
            {
                $group: {
                    _id: '$branch',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();

        console.log('Branches with suppliers:');
        console.log('========================');
        branches.forEach(b => {
            console.log(`${b._id || '(No Branch)'}: ${b.count} suppliers`);
        });

        // Show sample supplier from each branch
        console.log('\nSample suppliers from each branch:');
        console.log('===================================');
        for (const branch of branches) {
            const sample = await partiesCollection.findOne({
                branch: branch._id,
                partyType: 'supplier'
            });
            if (sample) {
                console.log(`\n${branch._id}:`);
                console.log(`  - ${sample.name} (${sample.code})`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkBranches();
