const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
    branch: {
        type: String,
        required: true,
        default: 'F-6' // Default based on user image
    },
    name: {
        type: String,
        required: [true, 'Please add a department name']
    },
    code: { type: String },
    deduction: { type: Number, default: 0 },
    targetSale01: { type: Number, default: 0 },
    commission01: { type: Number, default: 0 },
    targetSale02: { type: Number, default: 0 },
    commission02: { type: Number, default: 0 },
    combineDepSales: { type: Boolean, default: false },
    openingForward: { type: Boolean, default: false },
    receivingForward: { type: Boolean, default: false },
    bigCashForward: { type: Boolean, default: false },
    deductUgSale: { type: Boolean, default: false },
    deductOptSale: { type: Boolean, default: false },
    deductUgSaleFromAllDep: { type: Boolean, default: false },
    closing: { type: Boolean, default: false },
    isCashCounter: { type: Boolean, default: false },
    parentDepartment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    closing2CompSale: { type: Boolean, default: false },
    closing2DeptDropDown: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

DepartmentSchema.index({ branch: 1 });
DepartmentSchema.index({ branch: 1, name: 1 });
DepartmentSchema.index({ isActive: 1 });

module.exports = mongoose.model('Department', DepartmentSchema);
