const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { protect } = require('../middleware/auth');

// 需要认证的路由
router.get('/', protect, webhookController.getWebhook);
router.post('/regenerate', protect, webhookController.regenerateWebhook);
router.put('/base-url', protect, webhookController.updateBaseUrl);

module.exports = router;
