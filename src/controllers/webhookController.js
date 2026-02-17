const { User, Webhook, Order, Position, Exchange, Activity } = require('../models');

/**
 * @desc    获取当前用户的 Webhook 配置
 * @route   GET /api/webhook
 * @access  Private
 */
exports.getWebhook = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '用户不存在'
        }
      });
    }

    // 查询 Webhook 统计信息
    const webhook = await Webhook.findOne({ user: user._id });
    
    const baseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(200).json({
      success: true,
      data: {
        url: `${baseUrl}/webhook/${user.webhookToken}`,
        token: user.webhookToken,
        status: webhook?.status || 'active',
        lastReceived: webhook?.lastReceivedAt || null,
        totalReceived: webhook?.totalReceived || 0,
        stats: webhook?.stats || { successCount: 0, failCount: 0 },
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('GetWebhook error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    重新生成 Webhook Token
 * @route   POST /api/webhook/regenerate
 * @access  Private
 */
exports.regenerateWebhook = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '用户不存在'
        }
      });
    }

    // 重新生成 webhook token
    const newToken = user.regenerateWebhookToken();
    await user.save();

    // 更新 Webhook 记录
    await Webhook.findOneAndUpdate(
      { user: user._id },
      { token: newToken },
      { upsert: true }
    );

    const baseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(200).json({
      success: true,
      data: {
        url: `${baseUrl}/webhook/${newToken}`,
        token: newToken
      },
      message: '已生成新的 Webhook URL'
    });

  } catch (error) {
    console.error('RegenerateWebhook error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    接收 TradingView Webhook（公开接口）
 * @route   POST /webhook/:token
 * @access  Public
 */
exports.receiveWebhook = async (req, res) => {
  const { token } = req.params;
  const payload = req.body;

  console.log('Webhook received:', { token: token?.slice(0, 10) + '...', payload });

  try {
    // 1. 验证 token 并找到用户
    const user = await User.findOne({ webhookToken: token });
    
    if (!user) {
      console.log('Invalid webhook token:', token?.slice(0, 10) + '...');
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: '无效的 Webhook Token' }
      });
    }

    // 2. 更新 Webhook 统计
    let webhook = await Webhook.findOne({ user: user._id });
    if (!webhook) {
      webhook = await Webhook.create({ user: user._id, token });
    }

    // 3. 解析并验证消息
    const { 
      action,           // open_long, open_short, close_long, close_short, protection_sl
      symbol,           // BTCUSDT
      leverage,         // 20
      position_size,    // "30%"
      close_percent,    // "50%"
      order_type,       // market, limit
      entry_index,      // 1, 2, 3...
      tp_index,         // 止盈索引
      sl_index          // 止损索引
    } = payload;

    if (!action || !symbol) {
      await webhook.incrementReceived(false);
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '缺少 action 或 symbol' }
      });
    }

    // 4. 获取用户的交易所配置
    const exchangeConfig = await Exchange.findOne({ 
      user: user._id, 
      connected: true 
    }).select('+apiSecret +passphrase');

    if (!exchangeConfig) {
      await webhook.incrementReceived(false);
      return res.status(400).json({
        success: false,
        error: { code: 'NO_EXCHANGE', message: '用户未配置或未连接交易所' }
      });
    }

    // 5. 处理不同类型的操作
    let order = null;
    let result = null;

    if (action.startsWith('open_')) {
      // 开仓操作
      const direction = action === 'open_long' ? 'long' : 'short';
      const size = parseFloat(position_size?.replace('%', '') || 30);
      const lev = parseInt(leverage) || 20;

      // 创建订单记录
      order = await Order.create({
        user: user._id,
        exchange: exchangeConfig.exchange,
        symbol: symbol.toUpperCase(),
        action,
        orderType: order_type || 'market',
        leverage: lev,
        quantity: size, // 暂存百分比，实际下单时计算
        status: 'pending',
        source: 'webhook',
        webhookTrigger: `entry_${entry_index || 1}`
      });

      // TODO: 调用交易所 API 执行开仓
      // 模拟执行成功
      const mockPrice = symbol.includes('BTC') ? 42000 : 2500;
      const mockQuantity = (exchangeConfig.balance * size / 100 * lev) / mockPrice;
      
      order.executedPrice = mockPrice;
      order.quantity = mockQuantity;
      order.status = 'executed';
      order.executedAt = new Date();
      await order.save();

      // 创建持仓记录
      const margin = exchangeConfig.balance * size / 100;
      const position = await Position.create({
        user: user._id,
        exchange: exchangeConfig.exchange,
        symbol: symbol.toUpperCase(),
        direction,
        leverage: lev,
        entryPrice: mockPrice,
        currentPrice: mockPrice,
        quantity: mockQuantity,
        margin,
        status: 'open',
        openedAt: new Date()
      });

      result = {
        orderId: order._id,
        positionId: position._id,
        action,
        symbol,
        direction,
        leverage: lev,
        entryPrice: mockPrice,
        quantity: mockQuantity,
        status: 'executed',
        executedAt: order.executedAt
      };

      // 记录活动
      await Activity.log(user._id, 'position_opened', 
        `开${direction === 'long' ? '多' : '空'} ${symbol} ${lev}x`, 
        { symbol, amount: margin }
      );

    } else if (action.startsWith('close_') || action === 'protection_sl') {
      // 平仓操作
      const direction = action.includes('long') ? 'long' : 'short';
      const closeSize = parseFloat(close_percent?.replace('%', '') || 100);

      // 查找对应的持仓
      const position = await Position.findOne({
        user: user._id,
        symbol: symbol.toUpperCase(),
        status: 'open'
      });

      if (!position) {
        await webhook.incrementReceived(false);
        return res.status(404).json({
          success: false,
          error: { code: 'NO_POSITION', message: '未找到对应持仓' }
        });
      }

      // 创建订单记录
      order = await Order.create({
        user: user._id,
        exchange: exchangeConfig.exchange,
        symbol: symbol.toUpperCase(),
        action,
        orderType: order_type || 'market',
        quantity: position.quantity * closeSize / 100,
        status: 'pending',
        source: 'webhook',
        webhookTrigger: action === 'protection_sl' ? 'protection_sl' : 
                        tp_index ? `tp_${tp_index}` : `sl_${sl_index || 1}`,
        position: position._id
      });

      // TODO: 调用交易所 API 执行平仓
      // 模拟执行
      const mockClosePrice = position.entryPrice * (position.direction === 'long' ? 1.02 : 0.98);
      
      if (closeSize >= 100) {
        // 全部平仓
        await position.close(mockClosePrice, 
          action === 'protection_sl' ? 'stop_loss' : 
          tp_index ? 'take_profit' : 'stop_loss'
        );
      } else {
        // 部分平仓
        position.quantity = position.quantity * (1 - closeSize / 100);
        position.margin = position.margin * (1 - closeSize / 100);
        await position.save();
      }

      order.executedPrice = mockClosePrice;
      order.status = 'executed';
      order.executedAt = new Date();
      await order.save();

      const pnl = position.realizedPnl || 
        (position.margin * ((mockClosePrice - position.entryPrice) / position.entryPrice) * position.leverage * (position.direction === 'long' ? 1 : -1));

      result = {
        orderId: order._id,
        positionId: position._id,
        action,
        symbol,
        closePercent: closeSize,
        closePrice: mockClosePrice,
        realizedPnl: Math.round(pnl * 100) / 100,
        status: 'executed',
        executedAt: order.executedAt
      };

      // 记录活动
      const activityType = tp_index ? 'tp_triggered' : 'sl_triggered';
      await Activity.log(user._id, activityType, 
        `${tp_index ? '止盈' : '止损'}触发 平${closeSize}%仓`, 
        { symbol, amount: pnl }
      );
    } else {
      await webhook.incrementReceived(false);
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: `不支持的操作: ${action}` }
      });
    }

    // 6. 更新统计并返回成功
    await webhook.incrementReceived(true);

    console.log('Webhook processed successfully:', result);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('ReceiveWebhook error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '处理 Webhook 失败'
      }
    });
  }
};
