const mongoose = require('mongoose');
const WHItem = require('../models/WHItem');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';
const MISSING = [
    "ELENCE ALOE VERA MOISTURIZE TONER 400ML",
    "ELENCE ALOE VERA SOOTHING MOIST SPRAY 250ML",
    "DN MV ULTRA MAN 60TAB",
    "NBS CALBASE 30TAB",
    "NBS NUTRISURE ONE A DAY WOMEN 60TAB",
    "NBS NUTRISURE ONE A DAY MAN 60TAB"
];

async function fuzzySearch() {
    try {
        await mongoose.connect(MONGO_URI);

        for (const target of MISSING) {
            console.log(`\nSearching for keywords from: "${target}"`);
            const words = target.split(' ').filter(w => w.length > 2);
            const query = { $or: words.map(w => ({ name: { $regex: w, $options: 'i' } })) };

            const matches = await WHItem.find(query).limit(5);
            if (matches.length > 0) {
                matches.forEach(m => console.log(`   Possible Match: "${m.name}"`));
            } else {
                console.log(`   No similar items found.`);
            }
        }

        await mongoose.disconnect();
    } catch (e) { console.error(e); }
}

fuzzySearch();
