require('dotenv').config();
const mongoose = require('mongoose');

// Import all models to ensure they're registered with Mongoose
const User = require('../models/User');
const Item = require('../models/Item');
const Party = require('../models/Party');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const PurchaseReturn = require('../models/PurchaseReturn');
const CashTransaction = require('../models/CashTransaction');
const BankTransaction = require('../models/BankTransaction');
const Ledger = require('../models/Ledger');
const LedgerEntry = require('../models/LedgerEntry');
const StockLog = require('../models/StockLog');
const StockAdjustment = require('../models/StockAdjustment');
const Unit = require('../models/Unit');
const Tax = require('../models/Tax');
const Company = require('../models/Company');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const Transaction = require('../models/Transaction');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const Expense = require('../models/Expense');

async function initializeDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB successfully!');

        // Create initial data
        await createInitialData();

        console.log('Database initialization completed!');
        process.exit(0);
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
}

async function createInitialData() {
    // Create default admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dwatson.pk';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
        adminUser = await User.create({
            name: 'System Administrator',
            email: adminEmail,
            password: adminPassword,
            role: 'admin'
        });
        console.log(`Created admin user: ${adminEmail}`);
    } else {
        console.log(`Admin user ${adminEmail} already exists. Updating password...`);
        adminUser.password = adminPassword;
        await adminUser.save();
        console.log(`Updated password for admin user: ${adminEmail}`);
    }

    // Create default units
    const units = [
        { name: 'Pieces', shortName: 'PCS', isActive: true, createdBy: adminUser._id },
        { name: 'Kilograms', shortName: 'KG', isActive: true, createdBy: adminUser._id },
        { name: 'Liters', shortName: 'L', isActive: true, createdBy: adminUser._id },
        { name: 'Meters', shortName: 'M', isActive: true, createdBy: adminUser._id }
    ];

    for (const unit of units) {
        const exists = await Unit.findOne({ shortName: unit.shortName });
        if (!exists) {
            await Unit.create(unit);
        }
    }
    console.log('Created default units');

    // Create default tax rates
    const taxes = [
        { name: 'GST 5%', rate: 5, isActive: true, createdBy: adminUser._id },
        { name: 'GST 12%', rate: 12, isActive: true, createdBy: adminUser._id },
        { name: 'GST 18%', rate: 18, isActive: true, createdBy: adminUser._id },
        { name: 'No Tax', rate: 0, isActive: true, createdBy: adminUser._id }
    ];

    for (const tax of taxes) {
        const exists = await Tax.findOne({ rate: tax.rate });
        if (!exists) {
            await Tax.create(tax);
        }
    }
    console.log('Created default tax rates');

    // Create default settings
    const settings = await Settings.findOne();
    if (!settings) {
        await Settings.create({
            companyName: 'Your Company Name',
            createdBy: adminUser._id,
            company: {
                name: 'Your Company Name',
                address: 'Your Address',
                phone: 'Your Phone',
                email: 'your@email.com',
                gst: 'Your GST Number'
            },
            invoice: {
                prefix: 'INV',
                startNumber: 1,
                terms: 'Payment due within 30 days'
            }
        });
        console.log('Created default settings');
    }

    // Create sample parties
    const parties = [
        { name: 'John Customer', partyType: 'customer', email: 'john@example.com', phone: '1234567890', isActive: true, createdBy: adminUser._id },
        { name: 'ABC Supplier', partyType: 'supplier', email: 'supplier@abc.com', phone: '0987654321', isActive: true, createdBy: adminUser._id }
    ];

    for (const party of parties) {
        const exists = await Party.findOne({ email: party.email });
        if (!exists) {
            await Party.create({
                ...party,
                code: party.partyType === 'customer' ? 'CUST-001' : 'SUPP-001'
            });
        }
    }
    console.log('Created sample parties');

    // Create sample items
    const items = [
        { name: 'Sample Product 1', sku: 'SP001', salePrice: 100, purchasePrice: 80, stockQty: 50, category: 'Other', unit: 'pcs', isActive: true, createdBy: adminUser._id },
        { name: 'Sample Product 2', sku: 'SP002', salePrice: 200, purchasePrice: 160, stockQty: 30, category: 'Other', unit: 'pcs', isActive: true, createdBy: adminUser._id }
    ];

    for (const item of items) {
        const exists = await Item.findOne({ sku: item.sku });
        if (!exists) {
            await Item.create(item);
        }
    }
    console.log('Created sample items');
}

initializeDatabase();
