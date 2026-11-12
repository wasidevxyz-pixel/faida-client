const cp = require('child_process');
const fs = require('fs');
const path = require('path');

async function check() {
    const dumpPath = path.join(__dirname, '../../tmp/dump_check');
    if (fs.existsSync(dumpPath)) {
        fs.rmSync(dumpPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dumpPath, { recursive: true });

    try {
        const cmd = 'D:\\software\\mongodb-database-tools-windows-x86_64-100.14.0\\bin\\mongodump';
        const args = [
            '--uri="mongodb://127.0.0.1:27017/BAS-SOFTWARE"',
            '--collection=employees',
            `--out="${dumpPath}"`
        ];
        
        console.log('Running:', `${cmd} ${args.join(' ')}`);
        cp.execSync(`"${cmd}" ${args.join(' ')}`);
        
        const bsonFile = path.join(dumpPath, 'BAS-SOFTWARE', 'employees.bson');
        const stat = fs.statSync(bsonFile);
        console.log('--- CURRENT EMPLOYEES COLLECTION SIZE ---');
        console.log('BSON Size:', stat.size / 1024, 'KB');
        console.log('BSON Size:', stat.size / (1024 * 1024), 'MB');
        
    } catch (err) {
        console.error('Audit failed:', err.message);
    }
}

check();
