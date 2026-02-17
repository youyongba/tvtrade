const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { protect } = require('../middleware/auth');

// 所有路由都需要认证
router.use(protect);

// 获取所有配置 / 清空所有配置
router.route('/')
  .get(configController.getConfigs)
  .post(configController.createConfig)
  .delete(configController.clearConfigs);

// 单个配置操作
router.route('/:id')
  .get(configController.getConfig)
  .put(configController.updateConfig)
  .delete(configController.deleteConfig);

module.exports = router;
