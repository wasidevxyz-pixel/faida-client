const mongoose = require('mongoose');
require('dotenv').config({ path: 'Backend/.env' });

async function checkBanks() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Bank = require('./Backend/models/Bank');
        const banks = await Bank.find({ isActive: true }).limit(5);
        console.log('Sample Banks:');
        banks.forEach(b => {
            console.log(`Name: ${b.bankName}, Branch: ${b.branch}, ID: ${b._id}`);
        });
        
        const Store = require('./Backend/models/Store');
        const stores = await Store.find({}).limit(5);
        console.log('\nSample Stores:');
        stores.forEach(s => {
            console.log(`Name: ${s.name}, ID: ${s._id}`);
        });
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkBanks();
