const ccxt = require('ccxt');
const https = require('https');
const http = require('http');

// 交易所配置映射
const EXCHANGE_CONFIG = {
  binance: {
    className: 'binanceusdm', // Binance USDT-M Futures
    name: 'Binance Futures'
  },
  okx: {
    className: 'okx',
    name: 'OKX'
  },
  bybit: {
    className: 'bybit',
    name: 'Bybit'
  },
  bitget: {
    className: 'bitget',
    name: 'Bitget'
  }
};

// 创建代理 agent
function createProxyAgent() {
  // 支持多种代理环境变量格式（大小写都支持）
  const proxyUrl = process.env.PROXY_URL 
    || process.env.https_proxy 
    || process.env.HTTPS_PROXY 
    || process.env.http_proxy 
    || process.env.HTTP_PROXY;
  
  if (!proxyUrl) {
    console.log('No proxy configured. Set PROXY_URL or https_proxy in environment.');
    return null;
  }
  
  console.log('Using proxy:', proxyUrl);
  
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    console.log('Proxy agent error:', e.message);
    return null;
  }
}

/**
 * 创建交易所客户端
 * @param {string} exchangeId - 交易所 ID
 * @param {string} apiKey - API Key
 * @param {string} apiSecret - API Secret
 * @param {string} passphrase - Passphrase (可选)
 * @returns {ccxt.Exchange} 交易所实例
 */
function createExchangeClient(exchangeId, apiKey, apiSecret, passphrase = '') {
  const config = EXCHANGE_CONFIG[exchangeId];
  if (!config) {
    throw new Error(`不支持的交易所: ${exchangeId}`);
  }

  const ExchangeClass = ccxt[config.className];
  if (!ExchangeClass) {
    throw new Error(`交易所类不存在: ${config.className}`);
  }

  const agent = createProxyAgent();
  
  const options = {
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    timeout: 30000, // 30秒超时
    options: {
      defaultType: 'swap', // 默认使用永续合约
      adjustForTimeDifference: true
    }
  };

  // 设置代理 (ccxt 使用 httpAgent/httpsAgent)
  if (agent) {
    options.httpAgent = agent;
    options.httpsAgent = agent;
  }

  // OKX 和 Bitget 需要 passphrase
  if (['okx', 'bitget'].includes(exchangeId) && passphrase) {
    options.password = passphrase;
  }

  // Binance Futures 特殊配置
  if (exchangeId === 'binance') {
    options.options = {
      ...options.options,
      defaultType: 'future',
      adjustForTimeDifference: true,
      recvWindow: 60000
    };
  }

  // Bybit 特殊配置
  if (exchangeId === 'bybit') {
    options.options.defaultType = 'linear'; // USDT 永续
  }

  const client = new ExchangeClass(options);
  
  return client;
}

/**
 * 测试交易所连接并获取余额
 * @param {string} exchangeId - 交易所 ID
 * @param {string} apiKey - API Key
 * @param {string} apiSecret - API Secret
 * @param {string} passphrase - Passphrase
 * @returns {Promise<{success: boolean, balance?: number, permissions?: string[], message?: string}>}
 */
async function testExchangeConnection(exchangeId, apiKey, apiSecret, passphrase = '') {
  try {
    const client = createExchangeClient(exchangeId, apiKey, apiSecret, passphrase);

    // 获取账户余额
    const balance = await client.fetchBalance();

    // 计算 USDT 总余额（永续合约账户）
    let totalBalance = 0;
    
    // 不同交易所的余额结构不同
    if (balance.USDT) {
      // 优先使用 total（总余额 = 可用 + 冻结）
      totalBalance = parseFloat(balance.USDT.total || balance.USDT.free || 0);
    } else if (balance.total && balance.total.USDT) {
      totalBalance = parseFloat(balance.total.USDT);
    }

    // 尝试获取权限信息（部分交易所支持）
    const permissions = ['futures'];

    return {
      success: true,
      balance: parseFloat(totalBalance.toFixed(2)),
      permissions
    };

  } catch (error) {
    console.error('Exchange connection error:', error.message);

    // 解析错误信息
    let message = 'API 连接失败';
    const errMsg = error.message || '';
    
    if (errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
      message = '连接超时，请检查网络或稍后重试';
    } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
      message = '无法连接到交易所服务器，请检查网络';
    } else if (errMsg.includes('Invalid API') || errMsg.includes('invalid api')) {
      message = 'API Key 无效';
    } else if (errMsg.includes('Signature') || errMsg.includes('signature')) {
      message = 'API Secret 错误';
    } else if (errMsg.includes('IP') || errMsg.includes('whitelist')) {
      message = 'IP 地址未在白名单中';
    } else if (errMsg.includes('permission') || errMsg.includes('Permission')) {
      message = 'API 权限不足，请开启合约交易权限';
    } else if (errMsg.includes('timestamp') && !errMsg.includes('timed')) {
      message = '时间戳错误，请检查服务器时间';
    } else if (errMsg.includes('passphrase') || errMsg.includes('Passphrase')) {
      message = 'Passphrase 错误';
    } else if (errMsg) {
      message = errMsg.slice(0, 100); // 截取前100个字符
    }

    return {
      success: false,
      message
    };
  }
}

/**
 * 获取账户余额
 * @param {string} exchangeId - 交易所 ID
 * @param {string} apiKey - API Key
 * @param {string} apiSecret - API Secret
 * @param {string} passphrase - Passphrase
 * @returns {Promise<number>}
 */
async function getBalance(exchangeId, apiKey, apiSecret, passphrase = '') {
  const result = await testExchangeConnection(exchangeId, apiKey, apiSecret, passphrase);
  return result.success ? result.balance : 0;
}

module.exports = {
  createExchangeClient,
  testExchangeConnection,
  getBalance,
  EXCHANGE_CONFIG
};
