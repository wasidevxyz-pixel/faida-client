const express = require('express');
const router = express.Router();
const {
    getItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
    getNextSeqId
} = require('../controllers/commissionItemController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/next-seq', getNextSeqId);

router.route('/')
    .get(getItems)
    .post(createItem);

router.route('/:id')
    .get(getItem)
    .put(updateItem)
    .delete(deleteItem);

module.exports = router;
