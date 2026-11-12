const mongoose = require('mongoose');
const MONGO_URI = 'mongodb://localhost:27017/sales-inventory';

const checkDoc = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const sale = await db.collection('whsales').findOne({ _id: new mongoose.Types.ObjectId('6970b498c338835c1e8cddca') });
        console.log('Sale Doc:', JSON.stringify(sale, null, 2));
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};
checkDoc();
