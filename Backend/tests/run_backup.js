const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createBackup } = require('../utils/backupUtils');
const Settings = require('../models/Settings');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
        console.log('Connected to MongoDB');

        const settings = await Settings.findOne({});
        const backupFolderPath = path.join(__dirname, '../../tmp/test_backup');

        if (fs.existsSync(backupFolderPath)) {
            fs.rmSync(backupFolderPath, { recursive: true, force: true });
        }

        const config = {
            mongodbUri: 'mongodb://127.0.0.1:27017/BAS-SOFTWARE',
            backupFolderPath: backupFolderPath,
            mongoToolsPath: settings.mongoToolsPath,
            type: 'MANUAL',
            backupFolder: 'test_after_fix'
        };

        console.log('Starting manual backup with SPAWN fix...');
        await createBackup(config);
        console.log('Backup finished successfully!');

        const bsonFile = path.join(backupFolderPath, 'test_after_fix', 'BAS-SOFTWARE', 'employees.bson');
        const stat = fs.statSync(bsonFile);
        console.log('--- NEW BACKUP EMPLOYEE BSON SIZE ---');
        console.log('BSON Size:', stat.size / 1024, 'KB');

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

run();
