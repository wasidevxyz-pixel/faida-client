const cp = require('child_process');
const fs = require('fs');
const readline = require('readline');

async function count() {
    const bson = 'D:\\BAS-Backup\\backup-auto-2026-03-28\\BAS-SOFTWARE\\employees.bson';
    const tool = 'D:\\software\\mongodb-database-tools-windows-x86_64-100.14.0\\bin\\bsondump';
    
    const child = cp.spawn(tool, [bson]);
    const rl = readline.createInterface({ input: child.stdout });
    
    const branches = {};
    
    rl.on('line', (line) => {
        try {
            const doc = JSON.parse(line);
            const b = doc.branch || 'EMPTY';
            branches[b] = (branches[b] || 0) + 1;
        } catch (e) {}
    });
    
    rl.on('close', () => {
        console.log('--- ALL BRANCHES IN BSON ---');
        console.log(JSON.stringify(branches, null, 2));
        process.exit(0);
    });
}

count();
