const Config = require('../models/Config');

// 获取所有配置
exports.getConfigs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Config.countDocuments({ user: req.user._id });
    const configs = await Config.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: configs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('GetConfigs error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取配置失败' }
    });
  }
};

// 获取单个配置
exports.getConfig = async (req, res) => {
  try {
    const config = await Config.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '配置不存在' }
      });
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('GetConfig error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取配置失败' }
    });
  }
};

// 创建配置
exports.createConfig = async (req, res) => {
  try {
    const {
      name,
      symbol,
      direction,
      leverage,
      entries,
      takeProfits,
      stopLosses,
      protectionSL,
      protectionOrderType,
      // 向后兼容旧字段
      orderType,
      positionSize
    } = req.body;

    // 验证必填字段
    if (!name || !symbol || !direction || !leverage) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '缺少必填字段' }
      });
    }

    // 验证 entries 或 positionSize
    if ((!entries || entries.length === 0) && !positionSize) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '至少需要一个开仓配置' }
      });
    }

    const config = await Config.create({
      user: req.user._id,
      name,
      symbol: symbol.toUpperCase(),
      direction,
      leverage,
      entries: entries || [],
      takeProfits: takeProfits || [],
      stopLosses: stopLosses || [],
      protectionSL: protectionSL || false,
      protectionOrderType: protectionOrderType || 'market',
      // 向后兼容
      orderType: orderType || 'market',
      positionSize: positionSize
    });

    res.status(201).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('CreateConfig error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join(', ') }
      });
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '创建配置失败' }
    });
  }
};

// 更新配置
exports.updateConfig = async (req, res) => {
  try {
    const config = await Config.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '配置不存在' }
      });
    }

    // 可更新的字段
    const allowedFields = [
      'name', 'symbol', 'direction', 'leverage',
      'entries', 'takeProfits', 'stopLosses',
      'protectionSL', 'protectionOrderType',
      'orderType', 'positionSize', 'isActive'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        config[field] = req.body[field];
      }
    });

    await config.save();

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('UpdateConfig error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join(', ') }
      });
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '更新配置失败' }
    });
  }
};

// 删除配置
exports.deleteConfig = async (req, res) => {
  try {
    const config = await Config.findOneAndDelete({ 
      _id: req.params.id, 
      user: req.user._id 
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '配置不存在' }
      });
    }

    res.json({
      success: true,
      message: '配置已删除'
    });
  } catch (error) {
    console.error('DeleteConfig error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '删除配置失败' }
    });
  }
};

// 清空所有配置
exports.clearConfigs = async (req, res) => {
  try {
    const result = await Config.deleteMany({ user: req.user._id });

    res.json({
      success: true,
      message: '已清空所有配置',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('ClearConfigs error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '清空配置失败' }
    });
  }
};
