const express = require('express');
const router = express.Router();
const { getCities, createCity } = require('../controllers/whCityController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getCities)
    .post(createCity);

module.exports = router;
