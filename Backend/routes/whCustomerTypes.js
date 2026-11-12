const express = require('express');
const router = express.Router();
const { getCustomerTypes, createCustomerType } = require('../controllers/whCustomerTypeController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getCustomerTypes)
    .post(createCustomerType);

module.exports = router;
