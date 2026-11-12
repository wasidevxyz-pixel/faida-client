const cp = require('child_process');
const fs = require('fs');
const readline = require('readline');

async function count() {
    const bson = 'D:\\BAS-Backup\\backup-auto-2026-03-28\\BAS-SOFTWARE\\employees.bson';
    const tool = 'D:\\software\\mongodb-database-tools-windows-x86_64-100.14.0\\bin\\bsondump';
    
    console.log(`Analyzing ${bson} using bsondump stream...`);
    
    const child = cp.spawn(tool, [bson]);
    const rl = readline.createInterface({ input: child.stdout });
    
    let total = 0;
    let pwd = 0;
    let pwd_plain = 0;
    
    rl.on('line', (line) => {
        total++;
        if (line.includes('(PWD-1)')) pwd++;
        if (line.includes('PWD')) pwd_plain++;
    });
    
    rl.on('close', () => {
        console.log('--- BSON SCAN RESULTS ---');
        console.log('Total documents:', total);
        console.log('Documents with (PWD-1):', pwd);
        console.log('Documents with any PWD:', pwd_plain);
        process.exit(0);
    });
}

count();
