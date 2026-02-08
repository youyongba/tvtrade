const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// 公开路由
router.post('/register', authController.register);
router.post('/login', authController.login);

// 密码重置路由（公开）
router.post('/forgot-password', authController.forgotPassword);
router.get('/reset-password/:token', authController.validateResetToken);
router.post('/reset-password/:token', authController.resetPassword);

// 需要认证的路由
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);

module.exports = router;
