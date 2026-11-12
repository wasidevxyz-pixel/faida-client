const https = require('https');
const mongoose = require('mongoose');

async function getLiveEmployee(code) {
    const secret = process.env.BIOMETRIC_SECRET || process.env.BAS_SECRET_KEY || '';
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'bas.dwatson.co',
            path: `/api/v1/employees?code=${code}&all=true&basSecret=${encodeURIComponent(secret)}`,
            headers: {
                'bas-secret-key': secret
            }
        };
        https.get(options, (res) => {
            let chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    const json = JSON.parse(body);
                    resolve(json.data && json.data[0]);
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function restoreLiveFingerprint(employeeId, template) {
    const secret = process.env.BIOMETRIC_SECRET || process.env.BAS_SECRET_KEY || '';
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ employeeId, template });
        const req = https.request({
            hostname: 'bas.dwatson.co',
            path: '/api/v1/attendance/biometric/register',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'bas-secret-key': secret
            }
        }, (res) => {
            let chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    const Employee = mongoose.model('Employee', new mongoose.Schema({
        code: String,
        name: String,
        fingerprintTemplate: String
    }));

    const codes = ['3339', '3428', '3431'];
    for (const code of codes) {
        const localEmp = await Employee.findOne({ code });
        if (!localEmp || !localEmp.fingerprintTemplate || localEmp.fingerprintTemplate.startsWith('{')) {
            console.log(`[SKIP] No valid local FP for ${code}`);
            continue;
        }

        const liveEmp = await getLiveEmployee(code);
        if (!liveEmp) {
            console.log(`[SKIP] Live employee not found for ${code}`);
            continue;
        }

        console.log(`Restoring ${liveEmp.name} (Code: ${code}, LiveID: ${liveEmp._id})...`);
        const res = await restoreLiveFingerprint(liveEmp._id, localEmp.fingerprintTemplate);
        console.log(`Result for ${code}: Status ${res.status} -> ${res.body}`);
    }

    console.log('Restoration completed!');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
