const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Load Models (Local to Backend)
const WHItem = require('./models/WHItem');
const WHItemCompany = require('./models/WHItemCompany');
const WHItemCategory = require('./models/WHItemCategory');
const WHItemClass = require('./models/WHItemClass');
const WHItemSubClass = require('./models/WHItemSubClass');
const WHSupplier = require('./models/WHSupplier');

// ==========================================
// ⚙️ REMOTE CONFIGURATION
// ==========================================
// 🔴 REPLACE THIS WITH YOUR REMOTE SERVER CONNECTION STRING
const REMOTE_MONGO_URI = 'mongodb+srv://<username>:<password>@cluster.mongodb.net/TARGET_DB_NAME';

async function importItems() {
    try {
        console.log(`🔌 Connecting to REMOTE MongoDB: ${REMOTE_MONGO_URI}...`);

        if (REMOTE_MONGO_URI.includes('<username>')) {
            throw new Error("You must edit the script and set the valid REMOTE_MONGO_URI first!");
        }

        await mongoose.connect(REMOTE_MONGO_URI, { family: 4 });
        console.log('✅ Connected to REMOTE MongoDB');

        // Read Excel file
        const excelPath = path.join(__dirname, '../Export/item list.xlsx');
        console.log(`📁 Reading file: ${excelPath}`);

        if (!fs.existsSync(excelPath)) {
            throw new Error(`File not found: ${excelPath}`);
        }

        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

        console.log(`📊 Found ${data.length} items`);

        // Load References
        console.log('🔄 Loading references from REMOTE DB...');
        const companies = await WHItemCompany.find({});
        const categories = await WHItemCategory.find({});
        const classes = await WHItemClass.find({});
        const subClasses = await WHItemSubClass.find({});
        const suppliers = await WHSupplier.find({});

        console.log(`📦 Loaded: ${companies.length} Comp, ${categories.length} Cat, ${suppliers.length} Supp`);

        let successFn = 0, errorFn = 0;
        const errors = [];

        // Helper to get or create
        async function getOrCreate(model, name, cache, fieldMapper = {}) {
            if (!name) return null;
            const cleanName = String(name).trim();
            const searchName = cleanName.toLowerCase();

            // Check cache
            let item = cache.find(x => {
                const val = x.name || x.supplierName; // Handle different fields
                return val && String(val).toLowerCase() === searchName;
            });

            if (item) return item._id;

            // Create new
            try {
                const createData = { isActive: true };
                // Map name to correct field
                if (model.modelName === 'WHSupplier') {
                    createData.supplierName = cleanName;
                    createData.supplierNTN = 'N/A'; // Default required field
                    createData.code = `SUP-${Date.now()}`;
                } else if (model.modelName === 'WHItemCompany') {
                    createData.name = cleanName; // WHItemCompany uses 'name'
                } else {
                    createData.name = cleanName; // Others use 'name'
                }

                item = await model.create(createData);
                console.log(`✨ Created new ${model.modelName}: ${cleanName}`);

                // Add to cache
                cache.push(item);
                return item._id;
            } catch (e) {
                console.error(`❌ Failed to create ${model.modelName} '${cleanName}': ${e.message}`);
                // Try to fetch again in case of race condition
                item = await model.findOne(model.modelName === 'WHSupplier' ? { supplierName: cleanName } : { name: cleanName });
                if (item) {
                    cache.push(item);
                    return item._id;
                }
                throw e;
            }
        }

        // Initialize SeqId
        let lastItem = await WHItem.findOne().sort({ seqId: -1 });
        let currentSeqId = lastItem && lastItem.seqId ? lastItem.seqId : 0;
        console.log(`🔢 Starting SeqId on REMOTE DB: ${currentSeqId}`);

        console.log('🚀 Starting Smart Import into REMOTE DB...');

        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            try {
                const name = row['Item_Name'];
                const code = row['Item_Code'];

                if (!name) continue;

                // Get Refs
                const companyId = await getOrCreate(WHItemCompany, row['Company_Name'], companies);
                const categoryId = await getOrCreate(WHItemCategory, row['Category_Name'], categories);
                const classId = await getOrCreate(WHItemClass, row['Class_Name'], classes);
                const subClassId = await getOrCreate(WHItemSubClass, row['SubClass_Name'], subClasses);
                const supplierId = await getOrCreate(WHSupplier, row['Supplier_Name'], suppliers);

                const itemData = {
                    itemsCode: code ? String(code).trim() : `ITEM-${Date.now()}-${i}`,
                    barcode: '',
                    name: String(name).trim(),
                    costPrice: parseNumber(row['Cost_Price']),
                    salePrice: parseNumber(row['Sale_Price']),
                    retailPrice: parseNumber(row['Retial_Price']),
                    incentive: parseNumber(row['Incentive']),

                    company: companyId,
                    category: categoryId,
                    itemClass: classId,
                    subClass: subClassId,
                    supplier: supplierId,

                    isActive: true
                };

                // Validate references
                const missingRefs = [];
                if (!itemData.company) missingRefs.push(`Company: ${row['Company_Name']}`);
                if (!itemData.category) missingRefs.push(`Category: ${row['Category_Name']}`);
                if (!itemData.itemClass) missingRefs.push(`Class: ${row['Class_Name']}`);
                if (!itemData.subClass) missingRefs.push(`SubClass: ${row['SubClass_Name']}`);
                if (!itemData.supplier) missingRefs.push(`Supplier: ${row['Supplier_Name']}`);

                if (missingRefs.length > 0) {
                    throw new Error(`Failed to resolve/create refs: ${missingRefs.join(', ')}`);
                }

                // Check existence
                const existingItem = await WHItem.findOne({ itemsCode: itemData.itemsCode });

                if (existingItem) {
                    // Update
                    await WHItem.updateOne({ _id: existingItem._id }, itemData);
                } else {
                    // Create New
                    currentSeqId++;
                    itemData.seqId = currentSeqId;
                    await WHItem.create(itemData);
                }

                successFn++;
                if (successFn % 50 === 0) process.stdout.write(`\rProcessed ${successFn} items...`);

            } catch (err) {
                errorFn++;
                errors.push(`Row ${i + 2}: ${err.message}`);
            }
        }

        console.log(`\n✅ Finished. Success: ${successFn}, Errors: ${errorFn}`);
        if (errors.length > 0) {
            fs.writeFileSync('import_errors_remote.txt', errors.join('\n'));
            console.log('❌ Errors saved to import_errors_remote.txt');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Fatal:', err);
        process.exit(1);
    }
}

function parseNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
    return isNaN(num) ? 0 : num;
}

importItems();
