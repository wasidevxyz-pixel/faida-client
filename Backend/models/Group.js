const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a group name'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    rights: {
        // We will store rights as an object where keys are category/module names
        // and values are boolean or an array of specific actions.
        // Simplifying to a flat object of permissions for now.
        type: Map,
        of: Boolean,
        default: {}
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✓ BUGFIX: Pre-save hook to normalize rights
// Ensures that rights are always stored as a proper Mongoose Map with boolean values
// NOTE: Using async function (modern Mongoose 9.x syntax) instead of callback(next)
groupSchema.pre('save', async function() {
    if (this.rights && typeof this.rights === 'object' && !(this.rights instanceof Map)) {
        const normalizedRights = new Map();
        for (const [key, value] of Object.entries(this.rights)) {
            // Convert to boolean: true, 'true' string, or any truthy value → true
            normalizedRights.set(key, value === true || value === 'true');
        }
        this.rights = normalizedRights;
    }
});

// ✓ BUGFIX: Post-find hook to ensure rights are properly formatted after retrieval
// This helps with issues where Mongoose Maps might be serialized unpredictably
groupSchema.post('findOne', function(doc) {
    if (doc && doc.rights && !(doc.rights instanceof Map)) {
        const normalizedRights = new Map();
        try {
            if (typeof doc.rights === 'object') {
                for (const [key, value] of Object.entries(doc.rights)) {
                    normalizedRights.set(key, value === true || value === 'true');
                }
                doc.rights = normalizedRights;
            }
        } catch (e) {
            console.warn(`[GROUP POST-FIND] Could not normalize rights for group:`, e.message);
        }
    }
});

groupSchema.post('find', function(docs) {
    if (Array.isArray(docs)) {
        docs.forEach(doc => {
            if (doc && doc.rights && !(doc.rights instanceof Map)) {
                const normalizedRights = new Map();
                try {
                    if (typeof doc.rights === 'object') {
                        for (const [key, value] of Object.entries(doc.rights)) {
                            normalizedRights.set(key, value === true || value === 'true');
                        }
                        doc.rights = normalizedRights;
                    }
                } catch (e) {
                    console.warn(`[GROUP POST-FIND] Could not normalize rights:`, e.message);
                }
            }
        });
    }
});

module.exports = mongoose.model('Group', groupSchema);
