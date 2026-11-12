const mongoose = require('mongoose');

const MealDataSchema = new mongoose.Schema({
    bf: { type: Number, default: 0, min: 0 },
    lu: { type: Number, default: 0, min: 0 },
    di: { type: Number, default: 0, min: 0 }
}, { _id: false });

const FoodInvoiceSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: [true, 'Date is required']
    },
    meals: {
        senior:  { type: MealDataSchema, default: () => ({}) },
        filpino: { type: MealDataSchema, default: () => ({}) },
        arabic:  { type: MealDataSchema, default: () => ({}) },
        junior:  { type: MealDataSchema, default: () => ({}) },
        labour:  { type: MealDataSchema, default: () => ({}) }
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// unique per date (one entry per day)
FoodInvoiceSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('FoodInvoice', FoodInvoiceSchema);
