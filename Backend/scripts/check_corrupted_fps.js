const https = require('https');
const mongoose = require('mongoose');

async function getLiveEmployees() {
    const secret = process.env.BIOMETRIC_SECRET || process.env.BAS_SECRET_KEY || '';
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'bas.dwatson.co',
            path: `/api/v1/employees?all=true&basSecret=${encodeURIComponent(secret)}`,
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
                    resolve(json.data || []);
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    const Employee = mongoose.model('Employee', new mongoose.Schema({
        code: String,
        name: String,
        fingerprintTemplate: String
    }));

    const liveEmps = await getLiveEmployees();
    console.log('Live employees count:', liveEmps.length);

    const corruptedInLive = liveEmps.filter(e => e.fingerprintTemplate && (e.fingerprintTemplate.startsWith('{') || e.fingerprintTemplate.startsWith('[') || e.fingerprintTemplate === 'TEST_BASE64_FINGERPRINT'));
    console.log('Corrupted in live count:', corruptedInLive.length);

    for (const emp of corruptedInLive) {
        const local = await Employee.findOne({ code: emp.code });
        console.log(`Live Corrupted: Code=${emp.code}, Name=${emp.name}, Local has valid FP: ${!!(local && local.fingerprintTemplate && !local.fingerprintTemplate.startsWith('{'))}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
