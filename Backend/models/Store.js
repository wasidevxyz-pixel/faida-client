const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: String,
    email: String,
    address: String,
    ntn: String,
    strn: String,
    contactNo: String,
    employeeSalary: String,
    kamla: String,
    targetSale: String,
    simpleNadraCard: String,
    foodExpPerTime: {
        type: Number,
        default: 0
    },
    rotiPrice: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    showOnDashboard: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

storeSchema.index({ name: 1 });
storeSchema.index({ isActive: 1 });
storeSchema.index({ showOnDashboard: 1 });

module.exports = mongoose.model('Store', storeSchema);
