require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const Party = require('../models/Party');
const User = require('../models/User');
const StockLog = require('../models/StockLog');
const LedgerEntry = require('../models/LedgerEntry');
const Ledger = require('../models/Ledger');

async function createTestPurchase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB successfully!');

    // Get admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      throw new Error('Admin user not found. Please run init-database.js first.');
    }

    // Get first supplier
    const supplier = await Party.findOne({ partyType: 'supplier' });
    if (!supplier) {
      throw new Error('No supplier found. Please create a supplier first.');
    }

    // Get all active items
    const items = await Item.find({ isActive: true });
    if (items.length === 0) {
      throw new Error('No items found. Please create items first.');
    }

    console.log(`Found ${items.length} items to add to purchase`);

    // Prepare purchase items
    const purchaseItems = items.map(item => ({
      item: item._id,
      name: item.name,
      quantity: 10, // 10 qty for each item
      unit: item.unit || 'pcs',
      costPrice: item.purchasePrice || 100,
      salePrice: item.salePrice || 150,
      taxPercent: item.taxPercent || 0,
      total: (item.purchasePrice || 100) * 10
    }));

    // Calculate totals
    const subTotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);
    const discountTotal = 0;
    const taxTotal = 0;
    const shippingCharges = 0;
    const otherCharges = 0;
    const grandTotal = subTotal + taxTotal + shippingCharges + otherCharges;
    const paidAmount = 0;
    const balanceAmount = grandTotal - paidAmount;

    // Generate invoice number
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `PUR-${year}${month}-`;
    
    const lastPurchase = await Purchase.findOne({
      invoiceNo: { $regex: `^${prefix}` }
    }).sort({ invoiceNo: -1 });
    
    let nextNumber = 1;
    if (lastPurchase && lastPurchase.invoiceNo) {
      const lastNumber = parseInt(lastPurchase.invoiceNo.split('-')[2]) || 0;
      nextNumber = lastNumber + 1;
    }
    
    const invoiceNo = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create purchase
      const purchaseData = {
        invoiceNo: invoiceNo,
        supplier: supplier._id,
        date: new Date(),
        items: purchaseItems,
        subTotal: subTotal,
        discountTotal: discountTotal,
        taxTotal: taxTotal,
        shippingCharges: shippingCharges,
        otherCharges: otherCharges,
        grandTotal: grandTotal,
        paidAmount: paidAmount,
        balanceAmount: balanceAmount,
        paymentStatus: 'unpaid',
        paymentMode: 'credit',
        status: 'received',
        createdBy: adminUser._id
      };

      const purchase = new Purchase(purchaseData);
      const createdPurchase = await purchase.save({ session });

      console.log(`Created purchase: ${createdPurchase.invoiceNo}`);

      // Update inventory and create stock logs
      for (const item of createdPurchase.items) {
        const dbItem = await Item.findById(item.item).session(session);
        if (!dbItem) {
          throw new Error(`Item not found: ${item.item}`);
        }
        
        const previousQty = dbItem.stockQty || 0;
        const newQty = previousQty + item.quantity;

        // Update item stock
        await Item.findByIdAndUpdate(
          item.item,
          {
            $inc: { stockQty: item.quantity },
            $set: {
              purchasePrice: item.costPrice,
              salePrice: item.salePrice
            }
          },
          { session }
        );

        // Create stock log
        await StockLog.create([{
          itemId: item.item,
          type: 'in',
          qty: item.quantity,
          previousQty: previousQty,
          newQty: newQty,
          refType: 'purchase',
          refId: createdPurchase._id,
          date: createdPurchase.date,
          createdBy: adminUser._id,
          notes: `Purchase Invoice #${createdPurchase.invoiceNo}`
        }], { session });
      }

      // Update supplier balance for credit purchases
      await supplier.updateBalance(createdPurchase.balanceAmount, 'add', session);

      // Create ledger entries
      await LedgerEntry.create([{
        ledgerId: supplier._id,
        date: createdPurchase.date,
        debit: 0,
        credit: createdPurchase.balanceAmount,
        narration: `Purchase Invoice #${createdPurchase.invoiceNo}`,
        refType: 'purchase',
        refId: createdPurchase._id,
        createdBy: adminUser._id
      }], { session });

      // Create purchase ledger entry (only if grandTotal > 0)
      if (createdPurchase.grandTotal > 0) {
        const purchaseLedger = await Ledger.findOne({ ledgerType: 'purchase' }).session(session);
        if (purchaseLedger) {
          await LedgerEntry.create([{
            ledgerId: purchaseLedger._id,
            date: createdPurchase.date,
            debit: createdPurchase.grandTotal,
            credit: 0,
            narration: `Purchase Invoice #${createdPurchase.invoiceNo}`,
            refType: 'purchase',
            refId: createdPurchase._id,
            createdBy: adminUser._id
          }], { session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      console.log('\n✅ Purchase created successfully!');
      console.log(`Invoice No: ${createdPurchase.invoiceNo}`);
      console.log(`Supplier: ${supplier.name}`);
      console.log(`Total Items: ${purchaseItems.length}`);
      console.log(`Grand Total: ${grandTotal.toFixed(2)}`);
      console.log(`\nYou can now view this purchase in the purchase list.`);

      // Display purchase details
      const populatedPurchase = await Purchase.findById(createdPurchase._id)
        .populate('supplier', 'name')
        .populate('items.item', 'name sku');

      console.log('\n=== Purchase Details ===');
      console.log(JSON.stringify(populatedPurchase, null, 2));

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

    process.exit(0);
  } catch (error) {
    console.error('Error creating purchase:', error);
    process.exit(1);
  }
}

// Run the script
createTestPurchase();

