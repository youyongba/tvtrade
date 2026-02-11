const { Exchange } = require('../models');
const { testExchangeConnection } = require('../utils/exchangeClient');

// 支持的交易所列表
const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance Futures', requiresPassphrase: false },
  { id: 'okx', name: 'OKX', requiresPassphrase: true },
  { id: 'bybit', name: 'Bybit', requiresPassphrase: false },
  { id: 'bitget', name: 'Bitget', requiresPassphrase: true }
];

/**
 * @desc    获取支持的交易所列表
 * @route   GET /api/exchanges/supported
 * @access  Public
 */
exports.getSupportedExchanges = async (req, res) => {
  res.status(200).json({
    success: true,
    data: SUPPORTED_EXCHANGES
  });
};

/**
 * @desc    获取用户交易所配置
 * @route   GET /api/exchanges
 * @access  Private
 */
exports.getExchangeConfig = async (req, res) => {
  try {
    const exchange = await Exchange.findOne({ user: req.user.id });

    if (!exchange) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: exchange._id,
        exchange: exchange.exchange,
        apiKey: exchange.getMaskedApiKey(),
        connected: exchange.connected,
        balance: exchange.balance,
        permissions: exchange.permissions,
        updatedAt: exchange.updatedAt
      }
    });

  } catch (error) {
    console.error('GetExchangeConfig error:', error);
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
 * @desc    保存交易所配置
 * @route   POST /api/exchanges
 * @access  Private
 */
exports.saveExchangeConfig = async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret, passphrase } = req.body;

    // 验证必填字段
    if (!exchange || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写交易所、API Key 和 API Secret'
        }
      });
    }

    // 验证交易所是否支持
    const exchangeInfo = SUPPORTED_EXCHANGES.find(e => e.id === exchange);
    if (!exchangeInfo) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '不支持的交易所'
        }
      });
    }

    // 检查需要 passphrase 的交易所
    if (exchangeInfo.requiresPassphrase && !passphrase) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: `${exchangeInfo.name} 需要填写 Passphrase`
        }
      });
    }

    // 保存前先测试连接
    let connected = false;
    let balance = 0;
    let permissions = [];

    try {
      console.log(`Testing connection to ${exchange} before saving...`);
      const testResult = await testExchangeConnection(exchange, apiKey, apiSecret, passphrase);
      // testExchangeConnection 返回 success 字段表示连接状态
      connected = testResult.success === true;
      balance = testResult.balance || 0;
      permissions = testResult.permissions || [];
      console.log(`Connection test result: connected=${connected}, balance=${balance}`);
      
      if (!connected && testResult.message) {
        console.log(`Connection failed: ${testResult.message}`);
      }
    } catch (testError) {
      console.error('Connection test failed during save:', testError.message);
      // 连接测试失败，但仍然保存配置（用户可以稍后重新测试）
      connected = false;
    }

    // 查找或创建配置
    let exchangeConfig = await Exchange.findOne({ user: req.user.id });

    if (exchangeConfig) {
      // 更新现有配置
      exchangeConfig.exchange = exchange;
      exchangeConfig.apiKey = apiKey;
      exchangeConfig.apiSecret = apiSecret;
      exchangeConfig.passphrase = passphrase || '';
      exchangeConfig.connected = connected;
      exchangeConfig.balance = balance;
      exchangeConfig.permissions = permissions;
      exchangeConfig.lastConnectedAt = connected ? new Date() : exchangeConfig.lastConnectedAt;
      await exchangeConfig.save();
    } else {
      // 创建新配置
      exchangeConfig = await Exchange.create({
        user: req.user.id,
        exchange,
        apiKey,
        apiSecret,
        passphrase: passphrase || '',
        connected,
        balance,
        permissions,
        lastConnectedAt: connected ? new Date() : undefined
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: exchangeConfig._id,
        exchange: exchangeConfig.exchange,
        apiKey: exchangeConfig.getMaskedApiKey(),
        connected: exchangeConfig.connected,
        balance: exchangeConfig.balance,
        permissions: exchangeConfig.permissions,
        createdAt: exchangeConfig.createdAt
      }
    });

  } catch (error) {
    console.error('SaveExchangeConfig error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messages.join(', ')
        }
      });
    }

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
 * @desc    测试交易所连接
 * @route   POST /api/exchanges/test
 * @access  Private
 */
exports.testConnection = async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret, passphrase } = req.body;

    // 验证必填字段
    if (!exchange || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写交易所、API Key 和 API Secret'
        }
      });
    }

    // 验证交易所是否支持
    const exchangeInfo = SUPPORTED_EXCHANGES.find(e => e.id === exchange);
    if (!exchangeInfo) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '不支持的交易所'
        }
      });
    }

    // 调用真实交易所 API 进行测试
    console.log(`Testing connection to ${exchange}...`);
    const testResult = await testExchangeConnection(exchange, apiKey, apiSecret, passphrase);

    if (testResult.success) {
      // 更新数据库中的连接状态
      const exchangeConfig = await Exchange.findOne({ user: req.user.id });
      if (exchangeConfig) {
        exchangeConfig.connected = true;
        exchangeConfig.balance = testResult.balance;
        exchangeConfig.permissions = testResult.permissions;
        exchangeConfig.lastConnectedAt = new Date();
        await exchangeConfig.save();
      }

      console.log(`Connection successful. Balance: ${testResult.balance} USDT`);

      res.status(200).json({
        success: true,
        data: {
          connected: true,
          balance: testResult.balance,
          permissions: testResult.permissions
        }
      });
    } else {
      console.log(`Connection failed: ${testResult.message}`);
      res.status(400).json({
        success: false,
        error: {
          code: 'CONNECTION_FAILED',
          message: testResult.message || 'API 连接失败，请检查密钥是否正确'
        }
      });
    }

  } catch (error) {
    console.error('TestConnection error:', error);
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
 * @desc    删除交易所配置
 * @route   DELETE /api/exchanges/:id
 * @access  Private
 */
exports.deleteExchangeConfig = async (req, res) => {
  try {
    const exchange = await Exchange.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!exchange) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '交易所配置不存在'
        }
      });
    }

    await exchange.deleteOne();

    res.status(200).json({
      success: true,
      message: '交易所配置已删除'
    });

  } catch (error) {
    console.error('DeleteExchangeConfig error:', error);
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
 * @desc    刷新交易所余额（实时查询）
 * @route   POST /api/exchanges/refresh-balance
 * @access  Private
 */
exports.refreshBalance = async (req, res) => {
  try {
    // 获取用户的交易所配置（包含加密的 API 密钥）
    const exchange = await Exchange.findOne({ user: req.user.id }).select('+apiSecret +passphrase');

    if (!exchange) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '请先配置交易所 API'
        }
      });
    }

    // 解密 API 密钥
    const apiKey = exchange.apiKey;
    const apiSecret = exchange.getDecryptedSecret();
    const passphrase = exchange.getDecryptedPassphrase();

    console.log(`Refreshing balance for ${exchange.exchange}...`);

    // 调用交易所 API 获取最新余额
    const testResult = await testExchangeConnection(exchange.exchange, apiKey, apiSecret, passphrase);

    if (testResult.success) {
      // 更新数据库中的余额
      exchange.connected = true;
      exchange.balance = testResult.balance;
      exchange.permissions = testResult.permissions || [];
      exchange.lastConnectedAt = new Date();
      await exchange.save();

      console.log(`Balance refreshed: ${testResult.balance}`);

      res.status(200).json({
        success: true,
        data: {
          connected: true,
          balance: testResult.balance,
          permissions: testResult.permissions,
          updatedAt: new Date()
        }
      });
    } else {
      // 连接失败
      exchange.connected = false;
      await exchange.save();

      res.status(200).json({
        success: false,
        error: {
          code: 'CONNECTION_FAILED',
          message: testResult.message || 'API 连接失败'
        }
      });
    }

  } catch (error) {
    console.error('RefreshBalance error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误'
      }
    });
  }
};

