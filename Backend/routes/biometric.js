const express = require('express');
const router = express.Router();
const { 
    syncBiometricLog, 
    registerFingerprint,
    registerFace,
    getFaceDescriptors
} = require('../controllers/biometricController');

router.post('/', syncBiometricLog);
router.post('/register', registerFingerprint);
router.post('/face/register', registerFace);
router.get('/face/descriptors', getFaceDescriptors);

module.exports = router;
