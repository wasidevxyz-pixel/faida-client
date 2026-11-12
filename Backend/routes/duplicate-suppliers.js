const express = require('express');
const router = express.Router();
const Party = require('../models/Party');
const { protect } = require('../middleware/auth');

// @desc    Duplicate suppliers from one branch to all other branches
// @route   POST /api/v1/duplicate-suppliers
// @access  Private (Admin only)
router.post('/', protect, async (req, res) => {
    try {
        const { sourceBranch, targetBranches } = req.body;

        if (!sourceBranch || !targetBranches || !Array.isArray(targetBranches)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide sourceBranch and targetBranches array'
            });
        }

        // Get all suppliers from source branch
        const sourceSuppliers = await Party.find({
            branch: sourceBranch,
            partyType: 'supplier'
        });

        if (sourceSuppliers.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No suppliers found in ${sourceBranch}`
            });
        }

        let created = 0;
        let skipped = 0;
        const results = [];

        // For each target branch
        for (const targetBranch of targetBranches) {
            // For each supplier
            for (const supplier of sourceSuppliers) {
                // Check if already exists
                const existing = await Party.findOne({
                    name: supplier.name,
                    branch: targetBranch,
                    partyType: 'supplier'
                });

                if (existing) {
                    skipped++;
                    results.push({
                        name: supplier.name,
                        branch: targetBranch,
                        status: 'skipped',
                        reason: 'already exists'
                    });
                    continue;
                }

                // Create new supplier
                const newSupplier = new Party({
                    name: supplier.name,
                    branch: targetBranch,
                    partyType: 'supplier',
                    code: `${supplier.code.split('-')[0]}-${targetBranch.substring(0, 3).toUpperCase()}`,
                    phone: supplier.phone,
                    mobile: supplier.mobile,
                    email: supplier.email,
                    address: supplier.address,
                    taxNumber: supplier.taxNumber,
                    panNumber: supplier.panNumber,
                    category: supplier.category,
                    openingBalance: 0,
                    currentBalance: 0,
                    isActive: supplier.isActive,
                    notes: supplier.notes,
                    createdBy: req.user.id
                });

                await newSupplier.save();
                created++;
                results.push({
                    name: supplier.name,
                    branch: targetBranch,
                    status: 'created',
                    code: newSupplier.code
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Duplicated ${sourceSuppliers.length} suppliers from ${sourceBranch} to ${targetBranches.length} branches`,
            stats: {
                sourceSuppliers: sourceSuppliers.length,
                targetBranches: targetBranches.length,
                created,
                skipped
            },
            results
        });

    } catch (error) {
        console.error('Error duplicating suppliers:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

module.exports = router;
