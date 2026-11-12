const fs = require('fs');
const path = require('path');

const dir = 'Frontend/public/img';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// 1x1 gray pixel
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const buffer = Buffer.from(base64, 'base64');

fs.writeFileSync(path.join(dir, 'default-avatar.png'), buffer);
console.log('Created default-avatar.png');
