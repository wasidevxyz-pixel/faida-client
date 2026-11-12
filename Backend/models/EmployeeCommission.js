const mongoose = require('mongoose');

const EmployeeCommissionSchema = new mongoose.Schema({
    monthYear: {
        type: String, // Format YYYY-MM
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    department: {
        type: String,
        default: ''
    },
    subBranch: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['dep_item_wise', 'employee_wise', 'distribute', 'rotti_nashta', 'rotti_perks', 'sale_commission'],
        required: true
    },
    commissionBranch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommissionBranch'
    },
    // Category Wise Saving for Item Wise Commission
    whCategory: {
        type: String,
        default: ''
    },
    commissionCategory: {
        type: String,
        default: ''
    },
    remarks: {
        type: String,
        default: ''
    },
    // Specific fields for Rotti Perks
    fromDate: Date,
    toDate: Date,

    // The main data array, flexible structure based on type
    data: [{
        // Common fields
        id: String, // Product ID or Employee ID (custom string ID)
        code: String, // Barcode or Employee ID Code
        name: String, // Product Name or Employee Name

        // Dep Item Wise
        incentive: Number,
        price: Number,
        qty: Number,
        total: Number,

        // Employee Wise
        commission: Number,

        // Distribute
        otherCommission: Number,
        ugCommission: Number,
        warehouseCommission: Number,
        // totalCommission handled by 'commission' or 'total'

        // Rotti & Nashta
        nashtaDays: Number,
        nashtaRate: Number,
        nashtaTotal: Number,
        rottiDays: Number,
        rottiRate: Number,
        rottiTotal: Number,

        // Sale Commission (UG)
        saleBranch: String,
        saleAmount: Number,
        percentage: Number,
        itemWiseCommission: Number,
        dailyTarget: Number,
        monthlyTarget: Number,
        paidCommission: Number,
        balanceCommission: Number,
        mts: Number,
        tmTarget: Number,

        // General Total
        totalData: Number // To avoid naming conflict with total count
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Compound index to ensure uniqueness per period/branch/comm-branch/dept/category
EmployeeCommissionSchema.index({
    monthYear: 1,
    branch: 1,
    commissionBranch: 1,
    department: 1,
    subBranch: 1,
    type: 1,
    whCategory: 1,
    commissionCategory: 1
});

// Index to optimize employee commission lookups during payroll calculations
EmployeeCommissionSchema.index({ monthYear: 1, "data.id": 1 });

module.exports = mongoose.model('EmployeeCommission', EmployeeCommissionSchema);
