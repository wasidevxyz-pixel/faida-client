const mongoose = require('mongoose');

async function fix() {
    console.log('Connecting...');
    await mongoose.connect('mongodb://127.0.0.1:27017/BAS-SOFTWARE');
    console.log('Connected.');

    const db = mongoose.connection.db;
    const whitems = db.collection('whitems');
    const whstocklogs = db.collection('whstocklogs');

    const item = await whitems.findOne({
        $or: [
            { itemsCode: '2000' },
            { barcode: '2000' }
        ]
    });

    if (!item) {
        console.log('Item not found');
        process.exit();
    }

    console.log('Found:', item.name);
    const prevQty = (item.stock && item.stock[0]) ? item.stock[0].quantity : 0;

    console.log('Previous Qty:', prevQty);

    await whitems.updateOne(
        { _id: item._id },
        { $set: { "stock.0.quantity": 0 } }
    );

    await whstocklogs.insertOne({
        item: item._id,
        date: new Date(),
        type: 'audit',
        qty: -prevQty,
        previousQty: prevQty,
        newQty: 0,
        refType: 'audit',
        refId: item._id,
        remarks: 'System Fix: Manual Reset to Zero',
        createdAt: new Date(),
        updatedAt: new Date()
    });

    console.log('Stock fixed to zero.');
    process.exit();
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
