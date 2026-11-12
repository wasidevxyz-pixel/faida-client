const mongoose = require('mongoose');

const GeneratedFoodInvoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: [true, 'Invoice number is required'],
        unique: true
    },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    poNumber: { type: String },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    buyerName: { type: String },
    buyerAddress: { type: String },
    buyerCity: { type: String },
    buyerVAT: { type: String },
    buyerOtherID: { type: String },
    totals: {
        subTotal: { type: Number },
        vat: { type: Number },
        grandTotal: { type: Number },
        items: [{
            label: String,
            price: Number,
            qty: Number,
            taxable: Number,
            tax: Number,
            subtotalIncVAT: Number
        }]
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('GeneratedFoodInvoice', GeneratedFoodInvoiceSchema);
