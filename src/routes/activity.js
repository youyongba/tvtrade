const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { protect } = require('../middleware/auth');

// 所有路由都需要认证
router.use(protect);

// 获取活动记录 / 创建活动记录 / 清空活动记录
router.route('/')
  .get(activityController.getActivities)
  .post(activityController.createActivity)
  .delete(activityController.clearActivities);

module.exports = router;
