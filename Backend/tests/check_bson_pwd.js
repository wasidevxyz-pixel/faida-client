const cp = require('child_process');
const fs = require('fs');
const path = require('path');

async function check() {
    const bson = 'D:\\BAS-Backup\\backup-auto-2026-03-28\\BAS-SOFTWARE\\employees.bson';
    const json = 'tmp/employees_dump.json';
    
    try {
        const cmd = 'D:\\software\\mongodb-database-tools-windows-x86_64-100.14.0\\bin\\bsondump';
        console.log(`Dumping ${bson}...`);
        
        const dump = cp.spawnSync(cmd, [bson], { maxBuffer: 100 * 1024 * 1024 });
        const content = dump.stdout.toString();
        
        fs.writeFileSync(json, content);
        
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        console.log('Total documents in BSON:', lines.length);
        
        const pwds = lines.filter(l => l.includes('(PWD-1)'));
        console.log('Documents matching (PWD-1):', pwds.length);

        if (pwds.length > 0) {
            console.log('Sample PWD doc:', pwds[0]);
        }
        
    } catch (err) {
        console.error('Audit failed:', err.message);
    }
}

check();
