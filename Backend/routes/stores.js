const express = require('express');
const router = express.Router();
const {
    getStores,
    getStore,
    createStore,
    updateStore,
    deleteStore
} = require('../controllers/storeController');

const { protect, authorize } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiAuth');

router.route('/')
    .get(verifyApiKey, protect, getStores)
    .post(protect, authorize('admin', 'manager'), createStore);

router.route('/:id')
    .get(protect, getStore)
    .put(protect, authorize('admin', 'manager'), updateStore)
    .delete(protect, authorize('admin'), deleteStore);

module.exports = router;
