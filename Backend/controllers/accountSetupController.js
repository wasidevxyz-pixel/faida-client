const AccountGroup = require('../models/AccountGroup');
const AccountCategory = require('../models/AccountCategory');
const Account = require('../models/Account');

// --- Account Groups ---
exports.getAccountGroups = async (req, res) => {
    try {
        const groups = await AccountGroup.find().sort({ id: 1 });
        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createAccountGroup = async (req, res) => {
    try {
        const group = await AccountGroup.create(req.body);
        res.status(201).json({ success: true, data: group });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateAccountGroup = async (req, res) => {
    try {
        const group = await AccountGroup.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
        res.status(200).json({ success: true, data: group });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteAccountGroup = async (req, res) => {
    try {
        const group = await AccountGroup.findByIdAndDelete(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Account Categories ---
exports.getAccountCategories = async (req, res) => {
    try {
        const categories = await AccountCategory.find().populate('group').sort({ id: 1 });
        res.status(200).json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createAccountCategory = async (req, res) => {
    try {
        const category = await AccountCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateAccountCategory = async (req, res) => {
    try {
        const category = await AccountCategory.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteAccountCategory = async (req, res) => {
    try {
        const category = await AccountCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Accounts ---
exports.getAccounts = async (req, res) => {
    try {
        const accounts = await Account.find().populate('category').sort({ accountId: 1 });
        res.status(200).json({ success: true, data: accounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createAccount = async (req, res) => {
    try {
        const account = await Account.create(req.body);
        res.status(201).json({ success: true, data: account });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateAccount = async (req, res) => {
    try {
        const account = await Account.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
        if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
        res.status(200).json({ success: true, data: account });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        const account = await Account.findByIdAndDelete(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
