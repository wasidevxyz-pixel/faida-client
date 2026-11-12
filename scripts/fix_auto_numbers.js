const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/BAS-SOFTWARE';

// Define mini-models so we don't need external files
const WHSaleSchema = new mongoose.Schema({ invoiceNo: String, createdAt: Date }, { timestamps: true });
const WHSale = mongoose.model('WHSale', WHSaleSchema);

const WHSaleReturnSchema = new mongoose.Schema({ returnNo: String, createdAt: Date }, { timestamps: true });
const WHSaleReturn = mongoose.model('WHSaleReturn', WHSaleReturnSchema);

const WHPurchaseSchema = new mongoose.Schema({ invoiceNo: String, createdAt: Date }, { timestamps: true });
const WHPurchase = mongoose.model('WHPurchase', WHPurchaseSchema);

const WHPurchaseReturnSchema = new mongoose.Schema({ returnNo: String, createdAt: Date }, { timestamps: true });
const WHPurchaseReturn = mongoose.model('WHPurchaseReturn', WHPurchaseReturnSchema);

const fixAutoNumbers = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB...');

        const year = new Date().getFullYear();

        // 1. Fix WHSales
        const sales = await WHSale.find({ invoiceNo: 'AUTO' }).sort({ createdAt: 1 });
        console.log(`Found ${sales.length} WHSales with AUTO`);
        for (let i = 0; i < sales.length; i++) {
            const count = await WHSale.countDocuments({ invoiceNo: { $ne: 'AUTO' } });
            const newNo = `INV-WS-${year}-${String(count + 1).padStart(4, '0')}`;
            await WHSale.updateOne({ _id: sales[i]._id }, { invoiceNo: newNo });
            console.log(`Updated Sale ${sales[i]._id} to ${newNo}`);
        }

        // 2. Fix WHSaleReturns
        const returns = await WHSaleReturn.find({ returnNo: 'AUTO' }).sort({ createdAt: 1 });
        console.log(`Found ${returns.length} WHSaleReturns with AUTO`);
        for (let i = 0; i < returns.length; i++) {
            const count = await WHSaleReturn.countDocuments({ returnNo: { $ne: 'AUTO' } });
            const newNo = `SR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
            await WHSaleReturn.updateOne({ _id: returns[i]._id }, { returnNo: newNo });
            console.log(`Updated Return ${returns[i]._id} to ${newNo}`);
        }

        // 3. Fix WHPurchases
        const purchases = await WHPurchase.find({ invoiceNo: 'AUTO' }).sort({ createdAt: 1 });
        console.log(`Found ${purchases.length} WHPurchases with AUTO`);
        for (let i = 0; i < purchases.length; i++) {
            const count = await WHPurchase.countDocuments({ invoiceNo: { $ne: 'AUTO' } });
            const newNo = `PUR-${year}-${String(count + 1).padStart(4, '0')}`;
            await WHPurchase.updateOne({ _id: purchases[i]._id }, { invoiceNo: newNo });
            console.log(`Updated Purchase ${purchases[i]._id} to ${newNo}`);
        }

        // 4. Fix WHPurchaseReturns
        const purReturns = await WHPurchaseReturn.find({ returnNo: 'AUTO' }).sort({ createdAt: 1 });
        console.log(`Found ${purReturns.length} WHPurchaseReturns with AUTO`);
        for (let i = 0; i < purReturns.length; i++) {
            const count = await WHPurchaseReturn.countDocuments({ returnNo: { $ne: 'AUTO' } });
            const newNo = `PR-WS-${year}-${String(count + 1).padStart(4, '0')}`;
            await WHPurchaseReturn.updateOne({ _id: purReturns[i]._id }, { returnNo: newNo });
            console.log(`Updated Purchase Return ${purReturns[i]._id} to ${newNo}`);
        }

        console.log('All AUTO numbers fixed.');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixAutoNumbers();
