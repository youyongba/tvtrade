const Position = require('../models/Position');
const Exchange = require('../models/Exchange');
const { testExchangeConnection } = require('../utils/exchangeClient');

// 获取当前持仓列表
exports.getPositions = async (req, res) => {
  try {
    const { symbol, status = 'open' } = req.query;
    
    const query = { user: req.user._id };
    if (symbol) query.symbol = symbol.toUpperCase();
    if (status) query.status = status;

    const positions = await Position.find(query)
      .sort({ openedAt: -1 });

    res.json({
      success: true,
      data: positions
    });
  } catch (error) {
    console.error('GetPositions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取持仓失败' }
    });
  }
};

// 获取单个持仓详情
exports.getPosition = async (req, res) => {
  try {
    const position = await Position.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '持仓不存在' }
      });
    }

    res.json({
      success: true,
      data: position
    });
  } catch (error) {
    console.error('GetPosition error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取持仓失败' }
    });
  }
};

// 平仓
exports.closePosition = async (req, res) => {
  try {
    const { closePercent = 100, orderType = 'market' } = req.body;

    const position = await Position.findOne({ 
      _id: req.params.id, 
      user: req.user._id,
      status: 'open'
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '持仓不存在或已平仓' }
      });
    }

    // 获取用户的交易所配置
    const exchangeConfig = await Exchange.findOne({ 
      user: req.user._id,
      exchange: position.exchange
    }).select('+apiSecret +passphrase');

    if (!exchangeConfig) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_EXCHANGE', message: '未配置交易所 API' }
      });
    }

    // TODO: 实际调用交易所 API 执行平仓操作
    // 这里先模拟平仓结果
    const closePrice = position.currentPrice || position.entryPrice * 1.01;
    
    if (closePercent === 100) {
      // 全部平仓
      await position.close(closePrice, 'manual');
    } else {
      // 部分平仓 - 创建新的持仓记录表示剩余部分
      const closedQuantity = position.quantity * (closePercent / 100);
      const remainingQuantity = position.quantity - closedQuantity;
      
      // 计算已平仓部分的盈亏
      const priceDiff = position.direction === 'long' 
        ? closePrice - position.entryPrice
        : position.entryPrice - closePrice;
      const closedMargin = position.margin * (closePercent / 100);
      const realizedPnl = closedMargin * (priceDiff / position.entryPrice) * position.leverage;
      
      // 更新当前持仓
      position.quantity = remainingQuantity;
      position.margin = position.margin * (1 - closePercent / 100);
      await position.save();
      
      // 返回部分平仓结果
      return res.json({
        success: true,
        data: {
          positionId: position._id,
          symbol: position.symbol,
          closePercent,
          closedQuantity,
          remainingQuantity,
          closePrice,
          realizedPnl: Math.round(realizedPnl * 100) / 100,
          closedAt: new Date()
        }
      });
    }

    res.json({
      success: true,
      data: {
        positionId: position._id,
        symbol: position.symbol,
        closePercent: 100,
        closePrice: position.closePrice,
        realizedPnl: position.realizedPnl,
        closedAt: position.closedAt
      }
    });
  } catch (error) {
    console.error('ClosePosition error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '平仓失败' }
    });
  }
};

// 从交易所同步持仓
exports.syncPositions = async (req, res) => {
  try {
    const exchangeConfig = await Exchange.findOne({ 
      user: req.user._id,
      connected: true
    }).select('+apiSecret +passphrase');

    if (!exchangeConfig) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_EXCHANGE', message: '未配置或未连接交易所' }
      });
    }

    // TODO: 调用交易所 API 获取实际持仓
    // 这里先返回数据库中的持仓
    const positions = await Position.find({ 
      user: req.user._id, 
      status: 'open' 
    });

    res.json({
      success: true,
      data: positions,
      message: '持仓同步完成'
    });
  } catch (error) {
    console.error('SyncPositions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '同步持仓失败' }
    });
  }
};

// 获取持仓历史
exports.getPositionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, symbol } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { 
      user: req.user._id,
      status: { $in: ['closed', 'liquidated'] }
    };
    if (symbol) query.symbol = symbol.toUpperCase();

    const total = await Position.countDocuments(query);
    const positions = await Position.find(query)
      .sort({ closedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: positions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('GetPositionHistory error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取持仓历史失败' }
    });
  }
};
