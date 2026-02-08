const express = require('express');
const router = express.Router();
const exchangeController = require('../controllers/exchangeController');
const { protect } = require('../middleware/auth');

// 公开路由
router.get('/supported', exchangeController.getSupportedExchanges);

// 需要认证的路由
router.get('/', protect, exchangeController.getExchangeConfig);
router.post('/', protect, exchangeController.saveExchangeConfig);
router.post('/test', protect, exchangeController.testConnection);
router.delete('/:id', protect, exchangeController.deleteExchangeConfig);

module.exports = router;
