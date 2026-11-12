const fs = require('fs');

try {
    const list = fs.readdirSync('D:\\software');
    console.log(list);
} catch (err) {
    console.error(err.message);
}
