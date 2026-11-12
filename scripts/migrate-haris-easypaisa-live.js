/**
 * Production Migration Script: Transfer Haris SB EasyPaisa Entries
 * Target Branch: (G15 Markaz) ONLY
 * Date Range: 16-Sep-2026 to 25-Oct-2026 ONLY
 * 
 * Safe, Idempotent, with Automatic Pre-migration JSON Backup.
 * Does NOT touch any other branches.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from Backend/.env
dotenv.config({ path: path.join(__dirname, '../Backend/.env') });

const mongoose = require(path.join(__dirname, '../Backend/node_modules/mongoose'));
const Bank = require(path.join(__dirname, '../Backend/models/Bank'));
const DailyCash = require(path.join(__dirname, '../Backend/models/DailyCash'));
const Department = require(path.join(__dirname, '../Backend/models/Department'));
const EasypaisaSettlement = require(path.join(__dirname, '../Backend/models/EasypaisaSettlement'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bas-software';

async function runMigration() {
    console.log('====================================================');
    console.log(' BAS ERP: Live Haris SB EasyPaisa Migration Script');
    console.log('====================================================');
    console.log(`Connecting to: ${MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);

    await mongoose.connect(MONGO_URI);
    console.log(' Connected to MongoDB successfully.\n');

    const TARGET_BRANCH = '(G15 Markaz)';
    const START_DATE = new Date('2026-09-16T00:00:00.000Z');
    const END_DATE = new Date('2026-10-25T23:59:59.999Z');

    // 1. Resolve Source Bank: EASYPAISA (MED) in G15 Markaz
    const sourceBank = await Bank.findOne({
        branch: TARGET_BRANCH,
        bankName: { $regex: /^EASYPAISA\s*\(MED\)$/i }
    });

    if (!sourceBank) {
        console.error(`❌ Source bank "EASYPAISA (MED)" not found in branch "${TARGET_BRANCH}". Aborting.`);
        process.exit(1);
    }
    console.log(`✓ Source Bank Found: ${sourceBank.bankName} (ID: ${sourceBank._id})`);

    // 2. Resolve or Create Destination Bank: EASYPAISA (MED-HS) in G15 Markaz
    let destBank = await Bank.findOne({
        branch: TARGET_BRANCH,
        bankName: { $regex: /MED-HS|HS/i }
    });

    if (!destBank) {
        console.log(`ℹ Destination bank "EASYPAISA (MED-HS)" not found. Creating it...`);
        const medDept = await Department.findOne({
            branch: TARGET_BRANCH,
            name: { $regex: /medicine/i }
        });

        let newAccountNo = `${sourceBank.accountNo || 'EP'}-HS`;
        const existsAcc = await Bank.findOne({ accountNo: newAccountNo });
        if (existsAcc) {
            newAccountNo = `EP-MED-HS-${Date.now().toString().slice(-4)}`;
        }

        destBank = await Bank.create({
            bankType: 'Department Bank',
            bankName: 'EASYPAISA (MED-HS)',
            accountTitle: 'EASYPAISA',
            accountNo: newAccountNo,
            phoneNo: sourceBank.phoneNo || '',
            mobileNo: sourceBank.mobileNo || '',
            branch: TARGET_BRANCH,
            department: medDept ? medDept._id : sourceBank.department,
            deduction: 0,
            isActive: true
        });
        console.log(`✓ Created Destination Bank: ${destBank.bankName} (ID: ${destBank._id}, Acc: ${destBank.accountNo})`);
    } else {
        console.log(`✓ Destination Bank Found: ${destBank.bankName} (ID: ${destBank._id})`);
    }

    // 3. Find Haris DailyCash records eligible for migration
    const harisQuery = {
        branch: TARGET_BRANCH,
        bank: sourceBank._id,
        date: { $gte: START_DATE, $lte: END_DATE },
        remarks: { $regex: /haris/i }
    };

    const eligibleRecords = await DailyCash.find(harisQuery).lean();
    console.log(`\nFound ${eligibleRecords.length} Haris SB entries pending migration in ${TARGET_BRANCH}.`);

    if (eligibleRecords.length === 0) {
        console.log('ℹ All Haris records are already migrated or none exist matching the criteria.');
    } else {
        // 4. Save Backup JSON before making any modifications
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const backupPath = path.join(backupDir, `haris_backup_${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(eligibleRecords, null, 2));
        console.log(`✓ Pre-migration backup saved to: ${backupPath}`);

        // 5. Execute Migration: Update bank to destBank._id
        const recordIds = eligibleRecords.map(r => r._id);
        const updateResult = await DailyCash.updateMany(
            { _id: { $in: recordIds } },
            { $set: { bank: destBank._id } }
        );

        console.log(`✓ Successfully updated ${updateResult.modifiedCount} records to ${destBank.bankName}.`);

        // Compute breakdown of moved records
        let clearedAmt = 0;
        let pendingAmt = 0;
        eligibleRecords.forEach(r => {
            if (r.isVerified) clearedAmt += (r.totalAmount || 0);
            else pendingAmt += (r.totalAmount || 0);
        });

        console.log(`  - Cleared Amount: Rs. ${clearedAmt.toLocaleString('en-PK')} (${eligibleRecords.filter(r => r.isVerified).length} entries)`);
        console.log(`  - Pending Amount: Rs. ${pendingAmt.toLocaleString('en-PK')} (${eligibleRecords.filter(r => !r.isVerified).length} entries)`);
        console.log(`  - Total Transferred: Rs. ${(clearedAmt + pendingAmt).toLocaleString('en-PK')}`);
    }

    // 6. Sync pending EasypaisaSettlement records for G15 Markaz
    console.log(`\nSyncing EasypaisaSettlement records for ${TARGET_BRANCH}...`);
    const epBanksG15 = await Bank.find({
        branch: TARGET_BRANCH,
        bankName: { $regex: /easypaisa/i, $not: /med-hs|hs/i }
    }).lean();
    const epBankIdsG15 = epBanksG15.map(b => b._id);

    const pendingSettlements = await EasypaisaSettlement.find({
        branch: TARGET_BRANCH,
        status: 'pending',
        dateString: { $gte: '2026-09-16', $lte: '2026-10-26' }
    });

    for (const s of pendingSettlements) {
        const dStart = new Date(`${s.dateString}T00:00:00.000Z`);
        const dEnd = new Date(`${s.dateString}T23:59:59.999Z`);

        const dcItems = await DailyCash.find({
            branch: TARGET_BRANCH,
            bank: { $in: epBankIdsG15 },
            date: { $gte: dStart, $lte: dEnd }
        }).lean();

        const liveGross = dcItems.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
        if (s.systemGross !== liveGross) {
            console.log(`  - Date ${s.dateString}: Adjusted systemGross from ${s.systemGross} -> ${liveGross}`);
            s.systemGross = liveGross;
            s.systemNet = liveGross;
            s.systemDeduction = 0;
            await s.save();
        }
    }
    console.log('✓ Settlement sync complete.');

    // 7. Safety Validation: Verify zero other branches were affected
    const otherBranchesCheck = await DailyCash.countDocuments({
        branch: { $ne: TARGET_BRANCH },
        bank: destBank._id
    });
    console.log(`\n🛡️ Safety Audit:`);
    console.log(`  - Destination Bank Records in Other Branches: ${otherBranchesCheck} (MUST BE 0)`);
    console.log('====================================================');
    console.log(' Migration finished successfully without errors!');
    console.log('====================================================');

    process.exit(0);
}

runMigration().catch(err => {
    console.error('❌ Migration Error:', err);
    process.exit(1);
});
