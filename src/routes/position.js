const express = require('express');
const router = express.Router();
const positionController = require('../controllers/positionController');
const { protect } = require('../middleware/auth');

// 所有路由都需要认证
router.use(protect);

// 获取持仓列表
router.get('/', positionController.getPositions);

// 同步交易所持仓
router.post('/sync', positionController.syncPositions);

// 获取持仓历史
router.get('/history', positionController.getPositionHistory);

// 获取单个持仓
router.get('/:id', positionController.getPosition);

// 平仓
router.post('/:id/close', positionController.closePosition);

// 重置单个持仓的触发器
router.post('/:id/reset-triggers', positionController.resetTriggers);

// 按交易对重置所有持仓的触发器
router.post('/reset-triggers/:symbol', positionController.resetTriggersBySymbol);

module.exports = router;
