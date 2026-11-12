const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Local Models
const WHItem = require('./models/WHItem');
const WHItemCompany = require('./models/WHItemCompany');
const WHItemCategory = require('./models/WHItemCategory');
const WHItemClass = require('./models/WHItemClass');
const WHItemSubClass = require('./models/WHItemSubClass');
const WHSupplier = require('./models/WHSupplier');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sales-inventory';
const OUTPUT_FILE = path.join(__dirname, 'install-items-script.js');

(async () => {
    try {
        console.log('🔌 Connecting to DB to export data...');
        await mongoose.connect(MONGO_URI, { family: 4 });

        // Fetch Data
        console.log('📥 Fetching data...');
        const companies = await WHItemCompany.find({});
        const categories = await WHItemCategory.find({});
        const classes = await WHItemClass.find({});
        const subClasses = await WHItemSubClass.find({});
        const suppliers = await WHSupplier.find({});
        const items = await WHItem.find({});

        console.log(`📊 Stats:
        - Companies: ${companies.length}
        - Categories: ${categories.length}
        - Classes: ${classes.length}
        - SubClasses: ${subClasses.length}
        - Suppliers: ${suppliers.length}
        - Items: ${items.length}`);

        // Generate Script Content
        const scriptContent = `
const mongoose = require('mongoose');

// CONFIGURATION
// 🔴 Change this if your second system uses a different DB URL
const TARGET_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sales-inventory';

// DATA DUMP (Includes Companies, Categories, Suppliers, and Items with Incentives)
const DATA = {
    companies: ${JSON.stringify(companies, null, 0)},
    categories: ${JSON.stringify(categories, null, 0)},
    classes: ${JSON.stringify(classes, null, 0)},
    subClasses: ${JSON.stringify(subClasses, null, 0)},
    suppliers: ${JSON.stringify(suppliers, null, 0)},
    items: ${JSON.stringify(items, null, 0)}
};

(async () => {
    try {
        console.log('🔌 Connecting to Target DB:', TARGET_MONGO_URI);
        const conn = await mongoose.createConnection(TARGET_MONGO_URI, { family: 4 }).asPromise();
        console.log('✅ Connected.');

        // Helper to Upsert
        async function upsertCollection(collectionName, docs) {
            if (docs.length === 0) return;
            console.log(\`🔄 Syncing \${collectionName} (\${docs.length} docs)...\`);
            
            const model = conn.collection(collectionName);
            const bulkOps = docs.map(doc => {
                // Ensure _id is an ObjectId if it's a string
                if (doc._id && typeof doc._id === 'string') {
                    doc._id = new mongoose.Types.ObjectId(doc._id);
                }
                // Fix references in Items
                if (collectionName === 'whitems') {
                   ['company', 'category', 'itemClass', 'subClass', 'supplier', 'createdBy'].forEach(field => {
                       if (doc[field] && typeof doc[field] === 'string') {
                           doc[field] = new mongoose.Types.ObjectId(doc[field]);
                       }
                   });
                }
                 // Fix references in Suppliers
                if (collectionName === 'whsuppliers') {
                   ['branch', 'supplierCategory', 'createdBy'].forEach(field => {
                       if (doc[field] && typeof doc[field] === 'string') {
                           doc[field] = new mongoose.Types.ObjectId(doc[field]);
                       }
                   });
                }

                // Handle dates
                if (doc.createdAt) doc.createdAt = new Date(doc.createdAt);
                if (doc.updatedAt) doc.updatedAt = new Date(doc.updatedAt);
                
                return {
                    replaceOne: {
                        filter: { _id: new mongoose.Types.ObjectId(doc._id) },
                        replacement: doc,
                        upsert: true
                    }
                };
            });

            await model.bulkWrite(bulkOps);
            console.log(\`✅ \${collectionName} synced.\`);
        }

        // Execute Order matters for references (though we preserve IDs so strictly it doesn't, but logic is cleaner)
        await upsertCollection('whitemcompanies', DATA.companies);
        await upsertCollection('whitemcategories', DATA.categories);
        await upsertCollection('whitemclasses', DATA.classes);
        await upsertCollection('whitemsubclasses', DATA.subClasses);
        await upsertCollection('whsuppliers', DATA.suppliers);
        await upsertCollection('whitems', DATA.items);

        console.log('\\n🎉 IMPORT COMPLETE! All items and references have been installed.');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
})();
`;

        fs.writeFileSync(OUTPUT_FILE, scriptContent);
        console.log(`\n✅ GENERATED SUCCESSFULY: ${OUTPUT_FILE}`);
        console.log('👉 You can now copy this file to your second system and run: node install-items-script.js');

        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
