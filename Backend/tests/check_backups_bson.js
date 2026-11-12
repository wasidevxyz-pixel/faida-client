const fs = require('fs');
const path = require('path');

function walk(dir, results = []) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            walk(fullPath, results);
        } else if (file.endsWith('.bson')) {
            results.push({ name: fullPath, size: stat.size });
        }
    }
    return results;
}

async function check() {
    const p = 'D:\\software\\mongodb-database-tools-windows-x86_64-100.14.0\\bin\\backups';
    try {
        const bsons = walk(p);
        console.log('--- ALL BSON FILES IN BACKUPS ---');
        console.log(JSON.stringify(bsons, null, 2));
    } catch (err) {
        console.error('Audit failed:', err.message);
    }
}

check();
