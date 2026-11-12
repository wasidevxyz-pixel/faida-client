const asyncHandler = require('../middleware/async');
const ReferenceImage = require('../models/ReferenceImage');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/reference-images');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ref-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
}).single('image');

// @desc    Get all reference images
// @route   GET /api/v1/reference-images
// @access  Private
exports.getReferenceImages = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Filter by category
    if (req.query.category) {
        query.category = req.query.category;
    }

    // Filter by active status
    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
    }

    // Search by title or code
    if (req.query.search) {
        query.$or = [
            { title: { $regex: req.query.search, $options: 'i' } },
            { imageCode: { $regex: req.query.search, $options: 'i' } },
            { description: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
        query.createdAt = {};
        if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
        if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const total = await ReferenceImage.countDocuments(query);
    const images = await ReferenceImage.find(query)
        .populate('uploadedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    res.status(200).json({
        success: true,
        data: images,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Get single reference image
// @route   GET /api/v1/reference-images/:id
// @access  Private
exports.getReferenceImage = asyncHandler(async (req, res, next) => {
    const image = await ReferenceImage.findById(req.params.id)
        .populate('uploadedBy', 'name email');

    if (!image) {
        return res.status(404).json({
            success: false,
            message: 'Reference image not found'
        });
    }

    res.status(200).json({
        success: true,
        data: image
    });
});

// @desc    Create new reference image
// @route   POST /api/v1/reference-images
// @access  Private
exports.createReferenceImage = asyncHandler(async (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        try {
            // Add uploaded file info
            if (req.file) {
                req.body.imageUrl = `/uploads/reference-images/${req.file.filename}`;
                req.body.fileSize = req.file.size;
            }

            // Add user who uploaded
            req.body.uploadedBy = req.user.id;

            // Parse tags if sent as string
            if (req.body.tags && typeof req.body.tags === 'string') {
                req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
            }

            const image = await ReferenceImage.create(req.body);

            res.status(201).json({
                success: true,
                data: image
            });
        } catch (error) {
            // Delete uploaded file if database save fails
            if (req.file) {
                await fs.unlink(req.file.path).catch(console.error);
            }

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    });
});

// @desc    Update reference image
// @route   PUT /api/v1/reference-images/:id
// @access  Private
exports.updateReferenceImage = asyncHandler(async (req, res, next) => {
    let image = await ReferenceImage.findById(req.params.id);

    if (!image) {
        return res.status(404).json({
            success: false,
            message: 'Reference image not found'
        });
    }

    // Parse tags if sent as string
    if (req.body.tags && typeof req.body.tags === 'string') {
        req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
    }

    // Don't allow updating uploadedBy
    delete req.body.uploadedBy;

    image = await ReferenceImage.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
            returnDocument: 'after',
            runValidators: true
        }
    );

    res.status(200).json({
        success: true,
        data: image
    });
});

// @desc    Delete reference image
// @route   DELETE /api/v1/reference-images/:id
// @access  Private
exports.deleteReferenceImage = asyncHandler(async (req, res, next) => {
    const image = await ReferenceImage.findById(req.params.id);

    if (!image) {
        return res.status(404).json({
            success: false,
            message: 'Reference image not found'
        });
    }

    // Delete physical file
    if (image.imageUrl) {
        const filePath = path.join(__dirname, '..', image.imageUrl);
        await fs.unlink(filePath).catch(console.error);
    }

    await image.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});

// @desc    Increment usage count
// @route   POST /api/v1/reference-images/:id/use
// @access  Private
exports.incrementUsage = asyncHandler(async (req, res, next) => {
    const image = await ReferenceImage.findByIdAndUpdate(
        req.params.id,
        {
            $inc: { usageCount: 1 },
            lastUsedAt: new Date()
        },
        { returnDocument: 'after' }
    );

    if (!image) {
        return res.status(404).json({
            success: false,
            message: 'Reference image not found'
        });
    }

    res.status(200).json({
        success: true,
        data: image
    });
});

// @desc    Get images by category
// @route   GET /api/v1/reference-images/category/:category
// @access  Private
exports.getImagesByCategory = asyncHandler(async (req, res, next) => {
    const images = await ReferenceImage.find({
        category: req.params.category,
        isActive: true
    })
        .populate('uploadedBy', 'name')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: images.length,
        data: images
    });
});
