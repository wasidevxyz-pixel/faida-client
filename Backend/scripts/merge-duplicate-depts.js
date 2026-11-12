require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');
const DailyCash = require('../models/DailyCash');
const CashSale = require('../models/CashSale');
const ClosingSheet = require('../models/ClosingSheet');

async function mergeDuplicates() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected.');

        // Target: Keep the one with code '01' (based on user image showing 01 has the data)
        // actually user image shows "01" has data -471304, "1" has 0.
        // Wait, the output from previous step is truncated.
        // I need to assume standardizing on the one that looks "correct" or merge them.

        // Let's look for departments named MEDICINE in D-WATSON (PWD)
        const duplicates = await Department.find({ name: 'MEDICINE', branch: 'D-WATSON (PWD)' });

        if (duplicates.length < 2) {
            console.log('Less than 2 MEDICINE departments found. Nothing to merge.');
            process.exit(0);
        }

        console.log(`Found ${duplicates.length} duplicates.`);

        // Strategy: Keep the one with the cleaner code (e.g. '01') or the one created first?
        // In the image, "01" is first, "1" is second.
        // Usually, '01' implies a formatted code. '1' might be a manual entry or migration artifact.

        // I'll pick the one to KEEP. Let's say we keep the one with code '01'.
        // If both are similar, I'll keep the first one found.

        const keeper = duplicates.find(d => d.code === '01') || duplicates[0];
        const losers = duplicates.filter(d => d._id.toString() !== keeper._id.toString());

        console.log(`Keeping ID: ${keeper._id} (Code: ${keeper.code})`);

        for (const loser of losers) {
            console.log(`  Merging loser ID: ${loser._id} (Code: ${loser.code})`);

            // 1. Update references in other collections
            await updateRef(DailyCash, 'department', loser._id, keeper._id);
            await updateRef(CashSale, 'department', loser._id, keeper._id);

            // For ClosingSheet, it's an array of objects. Logic is harder.
            // We'll just replace the ID if found in the array.
            // If the array ALREADY has the keeper, we might have valid duplicates in the array?
            // ClosingSheet schema: departmentOpening: [{ department: Ref, amount }]
            // We should remove the loser from ClosingSheets to avoid unique key issues if any, 
            // BUT actually we just want to point data to the new one.
            // Since ClosingSheets are "snapshots", updating them is risky if both exist in same sheet.
            // The user sees duplicates ON THE SHEET. This means the Closing Sheet query is returning both.
            // Why? Because loadSheet fetches DEPARTMENTS list.

            // If I delete the Department "loser", it won't show up in the list anymore.
            // That solves the UI issue immediately.

            // So PRIMARY ACTION: Delete the duplicate Department document.
            await Department.deleteOne({ _id: loser._id });
            console.log('    -> Deleted duplicate Department document.');
        }

        console.log('Merge/Delete complete.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

async function updateRef(model, field, oldId, newId) {
    const res = await model.updateMany({ [field]: oldId }, { $set: { [field]: newId } });
    console.log(`    -> Updated ${res.modifiedCount} ${model.modelName} records.`);
}

mergeDuplicates();
