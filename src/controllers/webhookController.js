const { User, Webhook, Order, Position, Exchange, Activity, Config } = require('../models');
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
      direction: payloadDirection,  // "long" 或 "short"（止盈/止损需要）
      leverage,         // 20
      position_size,    // "30%"
      close_percent,    // "50%"
      order_type,       // market, limit
      entry_index,      // 1, 2, 3...
      tp_index,         // 止盈索引（可选）
      sl_index,         // 止损索引（可选）
      trigger,          // "tp_1", "sl_1" 等（前端发送）
      // 保护性止损相关字段
      set_protection_sl,        // true/false - 是否在止盈后挂保护性止损
      protection_sl_price,      // "entry_price" - 止损价格（开仓价）
      protection_sl_order_type  // "market" - 止损订单类型
    } = payload;
    
    // 兼容处理：从 trigger 字段解析 tp_index 或 sl_index
    let parsedTpIndex = tp_index;
    let parsedSlIndex = sl_index;
    if (trigger) {
      if (trigger.startsWith('tp_')) {
        parsedTpIndex = parseInt(trigger.replace('tp_', '')) || 1;
      } else if (trigger.startsWith('sl_')) {
        parsedSlIndex = parseInt(trigger.replace('sl_', '')) || 1;
      }
    }
    // 如果是 take_profit action 但没有 tp_index，默认为 1
    if (action === 'take_profit' && !parsedTpIndex) {
      parsedTpIndex = 1;
    }
    // 如果是 stop_loss action 但没有 sl_index，默认为 1
    if (action === 'stop_loss' && !parsedSlIndex) {
      parsedSlIndex = 1;
    }

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

    } else if (action.startsWith('close_') || action === 'protection_sl' || action === 'take_profit' || action === 'stop_loss') {
      // 平仓操作（包括止盈、止损）
      // 方向解析优先级: 1) payload.direction  2) action名称  3) 从持仓获取
      let direction;
      if (payloadDirection === 'long' || payloadDirection === 'short') {
        direction = payloadDirection;
      } else if (action.includes('long')) {
        direction = 'long';
      } else if (action.includes('short')) {
        direction = 'short';
      } else {
        direction = null;
      }
      const closeSize = parseFloat(close_percent?.replace('%', '') || 100);

      // 查找对应的持仓（有方向则精确匹配，无方向则匹配任意 open 持仓）
      const positionQuery = {
        user: user._id,
        symbol: symbol.toUpperCase(),
        status: 'open'
      };
      if (direction) {
        positionQuery.direction = direction;
      }
      const position = await Position.findOne(positionQuery);

      // 从持仓补充方向（兼容旧 webhook 无 direction 的情况）
      if (!direction && position) {
        direction = position.direction;
        console.log(`📎 从持仓记录获取方向: ${direction}`);
      }

      // ========== 防重复触发逻辑 ==========
      // 如果没有持仓，返回成功但不执行（适配 TradingView 每根 K 线触发）
      if (!position) {
        console.log(`⏭️  跳过: 没有 ${symbol} 持仓，不执行 ${action}`);
        await webhook.incrementReceived(true);  // 标记为成功接收
        return res.json({
          success: true,
          skipped: true,
          reason: 'NO_POSITION',
          message: `没有 ${symbol} 持仓，跳过 ${action}`
        });
      }

      // 检查止盈/止损是否已触发过
      const isTakeProfitAction = action === 'take_profit' || parsedTpIndex;
      const isStopLossAction = action === 'stop_loss' || parsedSlIndex;
      
      if (isTakeProfitAction && parsedTpIndex) {
        // 检查该止盈是否已触发
        if (position.triggeredTPs && position.triggeredTPs.includes(parsedTpIndex)) {
          console.log(`⏭️  跳过: 止盈 ${parsedTpIndex} 已触发过，不重复执行`);
          await webhook.incrementReceived(true);
          return res.json({
            success: true,
            skipped: true,
            reason: 'TP_ALREADY_TRIGGERED',
            message: `止盈 ${parsedTpIndex} 已触发过，跳过`
          });
        }
      }
      
      if (isStopLossAction && parsedSlIndex) {
        // 检查该止损是否已触发
        if (position.triggeredSLs && position.triggeredSLs.includes(parsedSlIndex)) {
          console.log(`⏭️  跳过: 止损 ${parsedSlIndex} 已触发过，不重复执行`);
          await webhook.incrementReceived(true);
          return res.json({
            success: true,
            skipped: true,
            reason: 'SL_ALREADY_TRIGGERED',
            message: `止损 ${parsedSlIndex} 已触发过，跳过`
          });
        }
      }
      // ========== 防重复触发逻辑结束 ==========

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
                        parsedTpIndex ? `tp_${parsedTpIndex}` : `sl_${parsedSlIndex || 1}`,
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
                                  (action === 'take_profit' || parsedTpIndex) ? 'take_profit' : 'stop_loss';
          position.realizedPnl = Math.round(pnl * 100) / 100;
        } else {
          // 部分平仓
          position.quantity = position.quantity * (1 - closeSize / 100);
          position.margin = position.margin * (1 - closeSize / 100);
        }
        
        // ========== 记录已触发的止盈/止损（防止重复触发）==========
        if (parsedTpIndex && (action === 'take_profit' || parsedTpIndex)) {
          if (!position.triggeredTPs) position.triggeredTPs = [];
          if (!position.triggeredTPs.includes(parsedTpIndex)) {
            position.triggeredTPs.push(parsedTpIndex);
            console.log(`✅ 记录止盈 ${parsedTpIndex} 已触发，当前已触发: [${position.triggeredTPs.join(', ')}]`);
          }
        }
        if (parsedSlIndex && (action === 'stop_loss' || parsedSlIndex)) {
          if (!position.triggeredSLs) position.triggeredSLs = [];
          if (!position.triggeredSLs.includes(parsedSlIndex)) {
            position.triggeredSLs.push(parsedSlIndex);
            console.log(`✅ 记录止损 ${parsedSlIndex} 已触发，当前已触发: [${position.triggeredSLs.join(', ')}]`);
          }
        }
        // ========== 记录结束 ==========
        
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
        const isTakeProfit = action === 'take_profit' || !!parsedTpIndex;
        const isStopLoss = action === 'stop_loss' || !!parsedSlIndex;
        const activityType = isTakeProfit ? 'tp_triggered' : 'sl_triggered';
        await Activity.log(user._id, activityType, 
          `${isTakeProfit ? '止盈' : '止损'}触发 平${closeSize}%仓`, 
          { symbol, amount: Math.round(pnl * 100) / 100 }
        );

        // ========== 保护性止损逻辑 ==========
        // 1. 判断是否需要挂保护性止损：优先 webhook payload，fallback 到用户 Config
        let shouldSetProtectionSL = set_protection_sl === true || set_protection_sl === 'true';
        let protectionSLSource = set_protection_sl !== undefined && set_protection_sl !== null ? 'webhook' : 'none';
        let configProtectionOrderType = null;

        if (!shouldSetProtectionSL && (set_protection_sl === undefined || set_protection_sl === null)) {
          try {
            const userConfig = await Config.findOne({
              user: user._id,
              symbol: { $regex: new RegExp('^' + symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
              isActive: true
            });
            if (userConfig && userConfig.protectionSL) {
              shouldSetProtectionSL = true;
              protectionSLSource = 'config';
              configProtectionOrderType = userConfig.protectionOrderType || 'market';
            }
          } catch (configErr) {
            console.log('   ⚠️ 读取用户配置失败:', configErr.message);
          }
        }

        // 2. 判断是否为止盈操作
        //    - 明确的 take_profit action 或有 tp_index/trigger
        //    - 如果 Config 启用了 protectionSL 且当前不是止损操作，也视为可触发保护性止损的操作
        const isTakeProfitForProtection = isTakeProfit || (shouldSetProtectionSL && !isStopLoss && action !== 'protection_sl');
        const finalOrderType = protection_sl_order_type || configProtectionOrderType || 'market';
        
        console.log('\n📊 保护性止损检查:');
        console.log(`   set_protection_sl: ${set_protection_sl} (type: ${typeof set_protection_sl})`);
        console.log(`   shouldSetProtectionSL: ${shouldSetProtectionSL} (来源: ${protectionSLSource})`);
        console.log(`   isTakeProfit: ${isTakeProfit}, isTakeProfitForProtection: ${isTakeProfitForProtection}`);
        console.log(`   isStopLoss: ${isStopLoss}, action: ${action}`);
        console.log(`   position.status: ${position.status}, quantity: ${position.quantity}`);
        console.log(`   position.direction: ${position.direction}, entryPrice: ${position.entryPrice}`);
        
        if (shouldSetProtectionSL && isTakeProfitForProtection) {
          // 查找该交易对同方向所有 open 持仓（分批开仓会产生多条记录）
          const protectionQuery = {
            user: user._id,
            symbol: symbol.toUpperCase(),
            status: 'open'
          };
          if (direction) {
            protectionQuery.direction = direction;
          }
          const allOpenPositions = await Position.find(protectionQuery);

          const anyProtectionPlaced = allOpenPositions.some(p => p.protectionSLPlaced);

          if (anyProtectionPlaced) {
            console.log('⏭️  保护性止损已挂过，跳过');
          } else if (allOpenPositions.length > 0) {
            // 计算所有开仓记录的加权平均开仓价（真实的保本价）
            let totalQty = 0;
            let totalNotional = 0;
            allOpenPositions.forEach(p => {
              totalQty += p.quantity;
              totalNotional += p.quantity * p.entryPrice;
            });

            const avgEntryPrice = totalQty > 0 ? totalNotional / totalQty : position.entryPrice;
            const dirLabel = position.direction === 'long' ? '多单' : '空单';
            const slSide = position.direction === 'long' ? 'SELL' : 'BUY';

            console.log(`\n🛡️  ${dirLabel}止盈触发，准备在开仓均价挂保护性止损单...`);
            console.log(`   方向: ${position.direction} → 止损方向: ${slSide}`);
            console.log(`   开仓记录: ${allOpenPositions.length} 条`);
            allOpenPositions.forEach((p, i) => {
              console.log(`     Entry ${i + 1}: 开仓价=${p.entryPrice}, 剩余数量=${p.quantity}`);
            });
            console.log(`   加权平均开仓价(保本价): ${avgEntryPrice}`);
            console.log(`   剩余总持仓: ${totalQty}`);
            
            try {
              const protectionResult = await placeProtectionStopLoss(
                exchangeConfig.exchange,
                apiKey,
                apiSecret,
                passphrase,
                {
                  symbol: symbol.toUpperCase(),
                  direction: position.direction,
                  quantity: totalQty,
                  entryPrice: avgEntryPrice,
                  orderType: finalOrderType.toUpperCase()
                }
              );

              result.protectionSL = {
                success: true,
                orderId: protectionResult.orderId,
                stopPrice: avgEntryPrice,
                quantity: totalQty,
                direction: position.direction,
                side: slSide,
                entries: allOpenPositions.length
              };

              // 标记同方向所有开仓记录的 protectionSLPlaced，防止重复挂单
              await Position.updateMany(
                protectionQuery,
                { $set: { protectionSLPlaced: true } }
              );

              console.log(`✅ ${dirLabel}保护性止损单挂单成功! 触发价(均价): ${avgEntryPrice}`);
              
              await Activity.log(user._id, 'order_executed', 
                `${dirLabel}挂保护性止损单 @ ${avgEntryPrice} (${allOpenPositions.length}条开仓均价)`, 
                { symbol, amount: 0 }
              );

            } catch (protectionError) {
              console.error('❌ 挂保护性止损单失败:', protectionError.message);
              
              result.protectionSL = {
                success: false,
                error: protectionError.message
              };

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
