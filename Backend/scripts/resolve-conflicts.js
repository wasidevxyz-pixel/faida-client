require('dotenv').config();
const mongoose = require('mongoose');
const ClosingSheet = require('../models/ClosingSheet');

async function resolve() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sales-inventory');
        console.log('Connected.');

        const targetName = "D-WATSON (PWD)";

        // Find all sheets that are NOT targetName
        const oldSheets = await ClosingSheet.find({ branch: { $ne: targetName } });
        console.log(`Found ${oldSheets.length} sheets with old branch names.`);

        for (const source of oldSheets) {
            console.log(`Processing Sheet ${source._id} (${source.date.toISOString().split('T')[0]}) - Branch: "${source.branch}"`);

            // Check if a target sheet exists for this date
            const target = await ClosingSheet.findOne({
                date: source.date,
                branch: targetName
            });

            if (target) {
                console.log(`  COMBINING: Found matching sheet ${target._id} with target branch.`);

                // Merge Data if target is missing it
                let modified = false;

                if ((!target.departmentOpening || target.departmentOpening.length === 0) && source.departmentOpening && source.departmentOpening.length > 0) {
                    target.departmentOpening = source.departmentOpening;
                    console.log('    -> Copied departmentOpening from old sheet.');
                    modified = true;
                }

                if ((!target.closing01 || !target.closing01.totalClosing01) && source.closing01) {
                    target.closing01 = source.closing01;
                    console.log('    -> Copied closing01 from old sheet.');
                    modified = true;
                }

                if (!target.closing02 && source.closing02) {
                    target.closing02 = source.closing02;
                    console.log('    -> Copied closing02 from old sheet.');
                    modified = true;
                }

                if (modified) await target.save();

                // Delete the old duplicate
                await ClosingSheet.deleteOne({ _id: source._id });
                console.log('    -> Deleted old sheet.');

            } else {
                console.log(`  MOVING: No conflict. Renaming branch to ${targetName}.`);
                source.branch = targetName;
                await source.save();
            }
        }

        console.log('Conflict resolution complete.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

resolve();
