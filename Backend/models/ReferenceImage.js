const mongoose = require('mongoose');

const referenceImageSchema = new mongoose.Schema({
    imageCode: {
        type: String,
        required: [true, 'Please provide image code'],
        unique: true,
        trim: true
    },
    title: {
        type: String,
        required: [true, 'Please provide image title'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    category: {
        type: String,
        enum: ['product', 'banner', 'logo', 'promotional', 'other'],
        default: 'other'
    },
    imageUrl: {
        type: String,
        required: [true, 'Please provide image URL']
    },
    thumbnailUrl: {
        type: String
    },
    fileSize: {
        type: Number, // in bytes
        default: 0
    },
    dimensions: {
        width: Number,
        height: Number
    },
    tags: [{
        type: String,
        trim: true
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes
referenceImageSchema.index({ category: 1 });
referenceImageSchema.index({ isActive: 1 });
referenceImageSchema.index({ uploadedBy: 1 });
referenceImageSchema.index({ createdAt: -1 });

// Pre-save hook to generate image code if not provided
referenceImageSchema.pre('save', async function (next) {
    if (!this.imageCode) {
        const count = await mongoose.model('ReferenceImage').countDocuments();
        this.imageCode = `IMG-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

module.exports = mongoose.model('ReferenceImage', referenceImageSchema);
