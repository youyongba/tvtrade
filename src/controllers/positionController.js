const Position = require('../models/Position');
const Exchange = require('../models/Exchange');
const { testExchangeConnection, getPrice, getExchangePositions } = require('../utils/exchangeClient');

// 获取当前持仓列表
exports.getPositions = async (req, res) => {
  try {
    const { symbol, status = 'open' } = req.query;
    
    const query = { user: req.user._id };
    if (symbol) query.symbol = symbol.toUpperCase();
    if (status) query.status = status;

    let positions = await Position.find(query)
      .sort({ openedAt: -1 })
      .lean();

    // 获取用户的交易所配置（需要 apiSecret 用于查询交易所持仓）
    const exchangeConfig = await Exchange.findOne({ 
      user: req.user._id,
      connected: true
    }).select('+apiSecret +passphrase');

    // 如果查询 open 持仓，与交易所同步状态并获取实时价格
    if (status === 'open' && positions.length > 0 && exchangeConfig) {
      let exchangePositions = [];
      try {
        const apiKey = exchangeConfig.apiKey;
        const apiSecret = exchangeConfig.getDecryptedSecret();
        const passphrase = exchangeConfig.passphrase ? exchangeConfig.getDecryptedPassphrase() : '';
        exchangePositions = await getExchangePositions(exchangeConfig.exchange, apiKey, apiSecret, passphrase);
      } catch (syncErr) {
        console.log('⚠️ 获取交易所持仓失败，跳过同步:', syncErr.message);
      }

      // 记录已同步过的 symbol+direction 组合，避免重复处理
      const syncedKeys = new Set();

      for (const pos of positions) {
        const syncKey = `${pos.symbol}_${pos.direction}`;

        // 检查交易所是否还有该持仓
        const exchangePos = exchangePositions.find(
          ep => ep.symbol === pos.symbol && ep.direction === pos.direction
        );

        if (!exchangePos && exchangePositions.length >= 0 && !syncedKeys.has(syncKey)) {
          // 交易所已无此持仓，自动标记为已平仓
          syncedKeys.add(syncKey);
          console.log(`🔄 同步: ${pos.symbol} ${pos.direction} 在交易所已无持仓，标记为 closed`);
          await Position.updateMany(
            { user: req.user._id, symbol: pos.symbol, direction: pos.direction, status: 'open' },
            { $set: { 
              status: 'closed', 
              closeReason: 'exchange_sync',
              closedAt: new Date()
            }}
          );
          pos.status = 'closed';
          continue;
        }

        if (exchangePos) {
          // 用交易所实时数据更新价格和盈亏
          pos.currentPrice = exchangePos.markPrice;
          
          if (pos.currentPrice && pos.entryPrice) {
            const priceDiff = pos.direction === 'long' 
              ? pos.currentPrice - pos.entryPrice
              : pos.entryPrice - pos.currentPrice;
            
            const pnlPercent = (priceDiff / pos.entryPrice) * pos.leverage * 100;
            const pnlAmount = pos.margin * (priceDiff / pos.entryPrice) * pos.leverage;
            
            pos.unrealizedPnl = Math.round(pnlAmount * 100) / 100;
            pos.unrealizedPnlPercent = Math.round(pnlPercent * 100) / 100;
          }
        }
      }

      // 过滤掉已同步关闭的，只返回仍然 open 的
      positions = positions.filter(p => p.status === 'open');
    }

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

    // 获取数据库中的持仓
    const positions = await Position.find({ 
      user: req.user._id, 
      status: 'open' 
    }).lean();

    // 获取实时价格并计算盈亏
    for (const pos of positions) {
      try {
        const currentPrice = await getPrice(exchangeConfig.exchange, pos.symbol);
        pos.currentPrice = currentPrice;
        
        // 计算未实现盈亏
        if (pos.currentPrice && pos.entryPrice) {
          const priceDiff = pos.direction === 'long' 
            ? pos.currentPrice - pos.entryPrice
            : pos.entryPrice - pos.currentPrice;
          
          const pnlPercent = (priceDiff / pos.entryPrice) * pos.leverage * 100;
          const pnlAmount = pos.margin * (priceDiff / pos.entryPrice) * pos.leverage;
          
          pos.unrealizedPnl = Math.round(pnlAmount * 100) / 100;
          pos.unrealizedPnlPercent = Math.round(pnlPercent * 100) / 100;
          
          console.log(`📊 同步 ${pos.symbol}: 开仓价=${pos.entryPrice}, 当前价=${currentPrice}, PnL=$${pos.unrealizedPnl} (${pos.unrealizedPnlPercent}%)`);
        }
      } catch (priceError) {
        console.error(`获取 ${pos.symbol} 价格失败:`, priceError.message);
      }
    }

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

// 重置持仓的触发状态（允许止盈/止损再次触发）
// 会同时重置同一交易对、同方向的所有 open 持仓（分批开仓场景）
exports.resetPositionTriggers = async (req, res) => {
  try {
    const { resetTPs = true, resetSLs = true, resetProtectionSL = true } = req.body;

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

    // 查找同一交易对所有方向的 open 持仓（多空一起重置）
    const allRelatedPositions = await Position.find({
      user: req.user._id,
      symbol: position.symbol,
      status: 'open'
    });

    const resetInfo = [];
    const updateFields = {};

    if (resetTPs) {
      const allTriggeredTPs = allRelatedPositions
        .flatMap(p => p.triggeredTPs || [])
        .filter((v, i, a) => a.indexOf(v) === i);
      if (allTriggeredTPs.length > 0) {
        resetInfo.push(`止盈 [${allTriggeredTPs.join(', ')}]`);
      }
      updateFields.triggeredTPs = [];
    }

    if (resetSLs) {
      const allTriggeredSLs = allRelatedPositions
        .flatMap(p => p.triggeredSLs || [])
        .filter((v, i, a) => a.indexOf(v) === i);
      if (allTriggeredSLs.length > 0) {
        resetInfo.push(`止损 [${allTriggeredSLs.join(', ')}]`);
      }
      updateFields.triggeredSLs = [];
    }

    if (resetProtectionSL) {
      const anyPlaced = allRelatedPositions.some(p => p.protectionSLPlaced);
      if (anyPlaced) {
        resetInfo.push('保护性止损');
      }
      updateFields.protectionSLPlaced = false;
    }

    // 批量更新所有相关持仓（多空一起重置）
    await Position.updateMany(
      {
        user: req.user._id,
        symbol: position.symbol,
        status: 'open'
      },
      { $set: updateFields }
    );

    console.log(`🔄 重置持仓触发状态: ${position.symbol} 多空全部 (${allRelatedPositions.length} 条记录) - ${resetInfo.join(', ') || '无需重置'}`);

    res.json({
      success: true,
      data: {
        positionId: position._id,
        symbol: position.symbol,
        direction: position.direction,
        affectedCount: allRelatedPositions.length,
        resetItems: resetInfo,
        currentState: {
          triggeredTPs: [],
          triggeredSLs: [],
          protectionSLPlaced: false
        }
      },
      message: resetInfo.length > 0 
        ? `已重置: ${resetInfo.join(', ')} (${allRelatedPositions.length} 条持仓)` 
        : '无需重置'
    });
  } catch (error) {
    console.error('ResetPositionTriggers error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '重置失败' }
    });
  }
};
