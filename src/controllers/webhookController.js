const { User, Webhook, Order, Position, Exchange, Activity } = require('../models');
const { openPosition, closePosition, getPrice, placeProtectionStopLoss } = require('../utils/exchangeClient');

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
    
    // 优先使用用户自定义的后端地址，否则使用环境变量或请求来源
    const defaultBaseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const baseUrl = user.webhookBaseUrl || defaultBaseUrl;

    res.status(200).json({
      success: true,
      data: {
        url: `${baseUrl}/webhook/${user.webhookToken}`,
        token: user.webhookToken,
        baseUrl: user.webhookBaseUrl || '',
        defaultBaseUrl,
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
  const receivedAt = new Date();

  // ========== 打印 TradingView Webhook 接收信息 ==========
  console.log('\n' + '='.repeat(60));
  console.log('📡 WEBHOOK RECEIVED:', receivedAt.toISOString());
  console.log('='.repeat(60));
  console.log('Token:', token?.slice(0, 15) + '...');
  console.log('Payload JSON:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('='.repeat(60) + '\n');

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
      action,           // open_long, open_short, close_long, close_short, protection_sl, take_profit, stop_loss
      symbol,           // BTCUSDT
      leverage,         // 20
      position_size,    // "30%"
      close_percent,    // "50%"
      order_type,       // market, limit
      entry_index,      // 1, 2, 3...
      tp_index,         // 止盈索引
      sl_index,         // 止损索引
      // 保护性止损相关字段
      set_protection_sl,        // true/false - 是否在止盈后挂保护性止损
      protection_sl_price,      // "entry_price" - 止损价格（开仓价）
      protection_sl_order_type  // "market" - 止损订单类型
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

      // 创建订单记录（状态为 pending）
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

      // ========== 真实交易所下单 ==========
      try {
        // 解密 API 密钥
        const apiKey = exchangeConfig.apiKey;
        const apiSecret = exchangeConfig.getDecryptedSecret();
        const passphrase = exchangeConfig.passphrase || '';
        
        // 调用交易所 API 开仓
        const orderResult = await openPosition(
          exchangeConfig.exchange,
          apiKey,
          apiSecret,
          passphrase,
          {
            symbol: symbol.toUpperCase(),
            direction,
            leverage: lev,
            positionSizePercent: size,
            balance: exchangeConfig.balance,
            orderType: (order_type || 'market').toUpperCase()
          }
        );

        // 更新订单状态
        order.exchangeOrderId = orderResult.orderId?.toString();
        order.executedPrice = orderResult.entryPrice;
        order.quantity = orderResult.quantity;
        order.status = 'executed';
        order.executedAt = new Date();
        order.exchangeResponse = orderResult.raw;
        await order.save();

        // 创建持仓记录
        const position = await Position.create({
          user: user._id,
          exchange: exchangeConfig.exchange,
          symbol: symbol.toUpperCase(),
          direction,
          leverage: lev,
          entryPrice: orderResult.entryPrice,
          currentPrice: orderResult.entryPrice,
          quantity: orderResult.quantity,
          margin: orderResult.margin,
          status: 'open',
          openedAt: new Date()
        });

        result = {
          orderId: order._id,
          exchangeOrderId: orderResult.orderId,
          positionId: position._id,
          action,
          symbol: symbol.toUpperCase(),
          direction,
          leverage: lev,
          entryPrice: orderResult.entryPrice,
          quantity: orderResult.quantity,
          margin: orderResult.margin,
          status: 'executed',
          executedAt: order.executedAt
        };

        // 记录活动
        await Activity.log(user._id, 'position_opened', 
          `开${direction === 'long' ? '多' : '空'} ${symbol} ${lev}x`, 
          { symbol, amount: orderResult.margin }
        );

      } catch (tradeError) {
        console.error('❌ 开仓失败:', tradeError.message);
        
        // 更新订单状态为失败
        order.status = 'failed';
        order.errorCode = 'TRADE_ERROR';
        order.errorMessage = tradeError.message;
        await order.save();

        // 记录失败活动
        await Activity.log(user._id, 'order_failed', 
          `开仓失败: ${tradeError.message}`, 
          { symbol }
        );

        await webhook.incrementReceived(false);
        return res.status(500).json({
          success: false,
          error: { code: 'TRADE_ERROR', message: tradeError.message }
        });
      }
      // ========== 真实交易所下单结束 ==========

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

      // 创建订单记录（状态为 pending）
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

      // ========== 真实交易所平仓 ==========
      try {
        // 解密 API 密钥
        const apiKey = exchangeConfig.apiKey;
        const apiSecret = exchangeConfig.getDecryptedSecret();
        const passphrase = exchangeConfig.passphrase || '';
        
        // 调用交易所 API 平仓
        const closeResult = await closePosition(
          exchangeConfig.exchange,
          apiKey,
          apiSecret,
          passphrase,
          {
            symbol: symbol.toUpperCase(),
            direction: position.direction,
            quantity: position.quantity,
            closePercent: closeSize,
            orderType: (order_type || 'market').toUpperCase()
          }
        );

        // 更新订单状态
        order.exchangeOrderId = closeResult.orderId?.toString();
        order.executedPrice = closeResult.closePrice;
        order.quantity = closeResult.closedQuantity;
        order.status = 'executed';
        order.executedAt = new Date();
        order.exchangeResponse = closeResult.raw;
        await order.save();

        // 计算盈亏
        const priceDiff = position.direction === 'long' 
          ? closeResult.closePrice - position.entryPrice
          : position.entryPrice - closeResult.closePrice;
        const closedMargin = position.margin * closeSize / 100;
        const pnl = closedMargin * (priceDiff / position.entryPrice) * position.leverage;

        // 更新持仓
        if (closeSize >= 100) {
          // 全部平仓
          position.status = 'closed';
          position.closePrice = closeResult.closePrice;
          position.closedAt = new Date();
          position.closeReason = action === 'protection_sl' ? 'stop_loss' : 
                                  tp_index ? 'take_profit' : 'stop_loss';
          position.realizedPnl = Math.round(pnl * 100) / 100;
        } else {
          // 部分平仓
          position.quantity = position.quantity * (1 - closeSize / 100);
          position.margin = position.margin * (1 - closeSize / 100);
        }
        await position.save();

        result = {
          orderId: order._id,
          exchangeOrderId: closeResult.orderId,
          positionId: position._id,
          action,
          symbol: symbol.toUpperCase(),
          closePercent: closeSize,
          closePrice: closeResult.closePrice,
          closedQuantity: closeResult.closedQuantity,
          realizedPnl: Math.round(pnl * 100) / 100,
          status: 'executed',
          executedAt: order.executedAt
        };

        // 记录活动
        const activityType = tp_index ? 'tp_triggered' : 'sl_triggered';
        await Activity.log(user._id, activityType, 
          `${tp_index ? '止盈' : '止损'}触发 平${closeSize}%仓`, 
          { symbol, amount: Math.round(pnl * 100) / 100 }
        );

        // ========== 保护性止损逻辑 ==========
        // 如果是止盈触发且设置了保护性止损，在开仓价挂止损单
        if (set_protection_sl === true && (action === 'take_profit' || tp_index)) {
          // 检查是否还有剩余持仓需要保护
          if (position.status === 'open' && position.quantity > 0) {
            console.log('\n🛡️  止盈触发，准备挂保护性止损单...');
            console.log(`   剩余持仓: ${position.quantity}, 开仓价: ${position.entryPrice}`);
            
            try {
              const protectionResult = await placeProtectionStopLoss(
                exchangeConfig.exchange,
                apiKey,
                apiSecret,
                passphrase,
                {
                  symbol: symbol.toUpperCase(),
                  direction: position.direction,
                  quantity: position.quantity,
                  entryPrice: position.entryPrice,
                  orderType: (protection_sl_order_type || 'market').toUpperCase()
                }
              );

              // 记录保护性止损挂单成功
              result.protectionSL = {
                success: true,
                orderId: protectionResult.orderId,
                stopPrice: position.entryPrice,
                quantity: position.quantity
              };

              console.log('✅ 保护性止损单挂单成功!');
              
              // 记录活动
              await Activity.log(user._id, 'order_executed', 
                `挂保护性止损单 @ ${position.entryPrice}`, 
                { symbol, amount: 0 }
              );

            } catch (protectionError) {
              console.error('❌ 挂保护性止损单失败:', protectionError.message);
              
              // 保护性止损失败不影响止盈的成功，但记录到结果中
              result.protectionSL = {
                success: false,
                error: protectionError.message
              };

              // 记录失败活动
              await Activity.log(user._id, 'order_failed', 
                `挂保护性止损单失败: ${protectionError.message}`, 
                { symbol }
              );
            }
          } else {
            console.log('⚠️  全部平仓，无需挂保护性止损单');
          }
        }
        // ========== 保护性止损逻辑结束 ==========

      } catch (tradeError) {
        console.error('❌ 平仓失败:', tradeError.message);
        
        // 更新订单状态为失败
        order.status = 'failed';
        order.errorCode = 'TRADE_ERROR';
        order.errorMessage = tradeError.message;
        await order.save();

        // 记录失败活动
        await Activity.log(user._id, 'order_failed', 
          `平仓失败: ${tradeError.message}`, 
          { symbol }
        );

        await webhook.incrementReceived(false);
        return res.status(500).json({
          success: false,
          error: { code: 'TRADE_ERROR', message: tradeError.message }
        });
      }
      // ========== 真实交易所平仓结束 ==========
    } else {
      await webhook.incrementReceived(false);
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: `不支持的操作: ${action}` }
      });
    }

    // 6. 更新统计并返回成功
    await webhook.incrementReceived(true);

    // ========== 打印处理结果 ==========
    console.log('\n' + '-'.repeat(60));
    console.log('✅ WEBHOOK PROCESSED SUCCESSFULLY');
    console.log('-'.repeat(60));
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('-'.repeat(60) + '\n');

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

/**
 * @desc    更新后端地址
 * @route   PUT /api/webhook/base-url
 * @access  Private
 */
exports.updateBaseUrl = async (req, res) => {
  try {
    const { baseUrl } = req.body;
    
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '用户不存在' }
      });
    }

    // 验证 URL 格式（允许空值表示使用默认地址）
    if (baseUrl && !/^https?:\/\/.+/.test(baseUrl)) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '后端地址必须以 http:// 或 https:// 开头' }
      });
    }

    // 去除尾部斜杠
    user.webhookBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
    await user.save();

    // 计算新的 Webhook URL
    const defaultBaseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const effectiveBaseUrl = user.webhookBaseUrl || defaultBaseUrl;

    res.status(200).json({
      success: true,
      data: {
        baseUrl: user.webhookBaseUrl,
        url: `${effectiveBaseUrl}/webhook/${user.webhookToken}`,
        defaultBaseUrl
      },
      message: user.webhookBaseUrl ? '后端地址已更新' : '已恢复默认地址'
    });

  } catch (error) {
    console.error('UpdateBaseUrl error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join(', ') }
      });
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '更新后端地址失败' }
    });
  }
};
