const PendingCheque = require('../models/PendingCheque');

exports.getPendingCheques = async (req, res) => {
    try {
        const { branch } = req.query;
        let query = {};
        if (branch) {
            query.branch = branch;
        }

        const records = await PendingCheque.find(query).sort({ date: -1 });

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

exports.addPendingCheque = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;

        const record = await PendingCheque.create(req.body);

        return res.status(201).json({
            success: true,
            data: record
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                error: messages
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Server Error'
            });
        }
    }
};

exports.updatePendingCheque = async (req, res) => {
    try {
        const record = await PendingCheque.findById(req.params.id);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'No record found'
            });
        }

        const updatedRecord = await PendingCheque.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        return res.status(200).json({
            success: true,
            data: updatedRecord
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

exports.deletePendingCheque = async (req, res) => {
    try {
        const record = await PendingCheque.findById(req.params.id);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'No record found'
            });
        }

        await record.deleteOne();

        return res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
