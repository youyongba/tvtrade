const Activity = require('../models/Activity');

/**
 * @desc    获取活动记录
 * @route   GET /api/activities
 * @access  Private
 */
exports.getActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { type } = req.query;

    // 构建查询条件
    const query = { user: req.user._id };
    if (type) {
      query.type = type;
    }

    const total = await Activity.countDocuments(query);
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('GetActivities error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取活动记录失败' }
    });
  }
};

/**
 * @desc    创建活动记录
 * @route   POST /api/activities
 * @access  Private
 */
exports.createActivity = async (req, res) => {
  try {
    const { type, title, symbol, amount, metadata } = req.body;

    if (!type || !title) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '缺少必填字段 type 或 title' }
      });
    }

    const activity = await Activity.create({
      user: req.user._id,
      type,
      title,
      symbol: symbol?.toUpperCase(),
      amount,
      metadata
    });

    res.status(201).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('CreateActivity error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join(', ') }
      });
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '创建活动记录失败' }
    });
  }
};

/**
 * @desc    清空活动记录
 * @route   DELETE /api/activities
 * @access  Private
 */
exports.clearActivities = async (req, res) => {
  try {
    const result = await Activity.deleteMany({ user: req.user._id });

    res.json({
      success: true,
      message: '已清空活动记录',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('ClearActivities error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '清空活动记录失败' }
    });
  }
};
