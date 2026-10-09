const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { requireUser } = require('../middleware/userAuth');

router.post('/register', ctrl.register);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/resend-otp', ctrl.resendOtp);
router.post('/login', ctrl.login);
router.get('/me', requireUser, ctrl.me);

module.exports = router;
