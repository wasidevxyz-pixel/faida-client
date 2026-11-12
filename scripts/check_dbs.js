const mongoose = require('mongoose');
const checkDBs = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017');
        const admin = mongoose.connection.useDb('admin').db;
        const dbs = await admin.admin().listDatabases();
        console.log('Databases:', JSON.stringify(dbs, null, 2));
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};
checkDBs();
