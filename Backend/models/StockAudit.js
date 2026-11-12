const mongoose = require('mongoose');

const stockAuditItemSchema = new mongoose.Schema({
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    code: String,
    name: String,
    store: {
        type: String,
        default: 'Shop'
    },
    systemQty: {
        type: Number,
        default: 0
    },
    physicalQty: {
        type: Number,
        required: true,
        min: 0
    },
    difference: {
        type: Number,
        default: 0
    },
    costPrice: {
        type: Number,
        default: 0
    },
    salePrice: {
        type: Number,
        default: 0
    },
    remarks: String
});

const stockAuditSchema = new mongoose.Schema({
    auditNo: {
        type: String,
        unique: true,
        trim: true
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    remarks: {
        type: String,
        trim: true
    },
    items: [stockAuditItemSchema],
    status: {
        type: String,
        enum: ['draft', 'posted'],
        default: 'draft'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Generate audit number
stockAuditSchema.pre('save', async function (next) {
    if (!this.auditNo) {
        const count = await mongoose.model('StockAudit').countDocuments();
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        this.auditNo = `SA-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    // Calculate differences
    if (this.items && this.items.length > 0) {
        this.items.forEach(item => {
            item.difference = (item.physicalQty || 0) - (item.systemQty || 0);
        });
    }

    next();
});

module.exports = mongoose.model('StockAudit', stockAuditSchema);
