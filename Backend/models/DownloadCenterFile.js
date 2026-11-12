const mongoose = require('mongoose');

const downloadCenterFileSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a file title'],
        trim: true,
        maxlength: [200, 'Title cannot be more than 200 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    originalFilename: {
        type: String,
        required: [true, 'Original filename is required'],
        trim: true
    },
    storedFilename: {
        type: String,
        required: [true, 'Stored filename is required'],
        unique: true
    },
    filePath: {
        type: String,
        required: [true, 'File path is required']
    },
    fileSize: {
        type: Number,
        required: true,
        max: [31457280, 'File size cannot exceed 30MB'] // 30 * 1024 * 1024
    },
    fileExtension: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    mimeType: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        enum: ['report', 'document', 'spreadsheet', 'presentation', 'other'],
        default: 'other'
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    branch: {
        type: String,
        default: ''
    },
    targetBranches: {
        type: [String],
        default: [] // Empty = visible to all branches
    },
    isAutoSent: {
        type: Boolean,
        default: false
    },
    sourceReport: {
        type: String,
        trim: true,
        default: ''
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    cleanupBatch: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
downloadCenterFileSchema.index({ expiresAt: 1 }); // Cleanup queries
downloadCenterFileSchema.index({ isActive: 1, createdAt: -1 }); // Listing
downloadCenterFileSchema.index({ uploadedBy: 1 });
downloadCenterFileSchema.index({ branch: 1 });
downloadCenterFileSchema.index({ targetBranches: 1 });

// Pre-save: auto-set expiresAt to 12 hours from creation if not already set
downloadCenterFileSchema.pre('save', function () {
    if (this.isNew && !this.expiresAt) {
        this.expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
    }
});

// Auto-detect category from file extension
downloadCenterFileSchema.pre('save', function () {
    if (this.isNew && this.fileExtension) {
        const ext = this.fileExtension.toLowerCase().replace('.', '');
        const categoryMap = {
            'pdf': 'report',
            'doc': 'document', 'docx': 'document', 'txt': 'document', 'rtf': 'document',
            'xls': 'spreadsheet', 'xlsx': 'spreadsheet', 'csv': 'spreadsheet',
            'ppt': 'presentation', 'pptx': 'presentation'
        };
        this.category = categoryMap[ext] || 'other';
    }
});

module.exports = mongoose.model('DownloadCenterFile', downloadCenterFileSchema);
