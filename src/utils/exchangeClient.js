const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 交易所配置映射
const EXCHANGE_CONFIG = {
  binance: {
    name: 'Binance Futures',
    baseUrl: 'https://fapi.binance.com',
    balanceEndpoint: '/fapi/v2/balance'
  },
  okx: {
    name: 'OKX',
    baseUrl: 'https://www.okx.com',
    balanceEndpoint: '/api/v5/account/balance'
  },
  bybit: {
    name: 'Bybit',
    baseUrl: 'https://api.bybit.com',
    balanceEndpoint: '/v5/account/wallet-balance'
  },
  bitget: {
    name: 'Bitget',
    baseUrl: 'https://api.bitget.com',
    balanceEndpoint: '/api/v2/mix/account/accounts'
  }
};

// 获取代理 agent
function getProxyAgent() {
  const proxyUrl = process.env.PROXY_URL || process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  if (proxyUrl) {
    console.log('Using proxy:', proxyUrl);
    return new HttpsProxyAgent(proxyUrl);
  }
  return null;
}

// 发起 HTTPS 请求
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const agent = getProxyAgent();
    
    const req = https.request({
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent: agent,
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.slice(0, 100)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// 生成 HMAC 签名
function createSignature(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

/**
 * 获取 Binance 服务器时间
 */
async function getBinanceServerTime() {
  const data = await httpsRequest('https://fapi.binance.com/fapi/v1/time', {
    method: 'GET'
  });
  return data.serverTime;
}

/**
 * 测试 Binance Futures 连接
 */
async function testBinanceConnection(apiKey, apiSecret) {
  const config = EXCHANGE_CONFIG.binance;
  
  // 获取服务器时间以避免时间戳问题
  const serverTime = await getBinanceServerTime();
  console.log(`Server time: ${serverTime}, Local time: ${Date.now()}, Diff: ${Date.now() - serverTime}ms`);
  
  const queryString = `timestamp=${serverTime}&recvWindow=60000`;
  const signature = createSignature(queryString, apiSecret);
  
  const url = `${config.baseUrl}${config.balanceEndpoint}?${queryString}&signature=${signature}`;
  
  const data = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey
    }
  });
  
  if (data.code) {
    throw new Error(data.msg || `Error code: ${data.code}`);
  }
  
  // 计算 USDT 余额（U本位合约账户）
  let balance = 0;
  console.log('Binance Futures balance response:', JSON.stringify(data).slice(0, 500));
  
  if (Array.isArray(data)) {
    const usdtAsset = data.find(a => a.asset === 'USDT');
    if (usdtAsset) {
      // balance: 钱包余额, availableBalance: 可用余额, crossWalletBalance: 全仓余额
      console.log('USDT asset found:', JSON.stringify(usdtAsset));
      balance = parseFloat(usdtAsset.balance || usdtAsset.crossWalletBalance || usdtAsset.availableBalance || 0);
    } else {
      console.log('No USDT asset found in futures account. Available assets:', data.map(a => a.asset).join(', '));
    }
  }
  
  return {
    success: true,
    balance: parseFloat(balance.toFixed(2)),
    permissions: ['futures']
  };
}

/**
 * 测试 OKX 连接
 */
async function testOkxConnection(apiKey, apiSecret, passphrase) {
  const config = EXCHANGE_CONFIG.okx;
  const timestamp = new Date().toISOString();
  const method = 'GET';
  const requestPath = '/api/v5/account/balance';
  
  const preHash = timestamp + method + requestPath;
  const signature = crypto.createHmac('sha256', apiSecret).update(preHash).digest('base64');
  
  const url = `${config.baseUrl}${requestPath}`;
  
  const data = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    }
  });
  
  if (data.code !== '0') {
    throw new Error(data.msg || `Error code: ${data.code}`);
  }
  
  // 计算 USDT 余额
  let balance = 0;
  if (data.data && data.data[0] && data.data[0].details) {
    const usdtAsset = data.data[0].details.find(a => a.ccy === 'USDT');
    if (usdtAsset) {
      balance = parseFloat(usdtAsset.availBal || usdtAsset.cashBal || 0);
    }
  }
  
  return {
    success: true,
    balance: parseFloat(balance.toFixed(2)),
    permissions: ['futures']
  };
}

/**
 * 测试 Bybit 连接
 */
async function testBybitConnection(apiKey, apiSecret) {
  const config = EXCHANGE_CONFIG.bybit;
  const timestamp = Date.now();
  const recvWindow = 60000;
  const queryString = `accountType=UNIFIED`;
  
  const preHash = `${timestamp}${apiKey}${recvWindow}${queryString}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(preHash).digest('hex');
  
  const url = `${config.baseUrl}${config.balanceEndpoint}?${queryString}`;
  
  const data = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp.toString(),
      'X-BAPI-RECV-WINDOW': recvWindow.toString()
    }
  });
  
  if (data.retCode !== 0) {
    throw new Error(data.retMsg || `Error code: ${data.retCode}`);
  }
  
  // 计算 USDT 余额
  let balance = 0;
  if (data.result && data.result.list && data.result.list[0]) {
    const coins = data.result.list[0].coin || [];
    const usdtAsset = coins.find(c => c.coin === 'USDT');
    if (usdtAsset) {
      balance = parseFloat(usdtAsset.walletBalance || usdtAsset.availableToWithdraw || 0);
    }
  }
  
  return {
    success: true,
    balance: parseFloat(balance.toFixed(2)),
    permissions: ['futures']
  };
}

/**
 * 测试 Bitget 连接
 */
async function testBitgetConnection(apiKey, apiSecret, passphrase) {
  const config = EXCHANGE_CONFIG.bitget;
  const timestamp = Date.now();
  const method = 'GET';
  const requestPath = '/api/v2/mix/account/accounts?productType=USDT-FUTURES';
  
  const preHash = `${timestamp}${method}${requestPath}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(preHash).digest('base64');
  
  const url = `${config.baseUrl}${requestPath}`;
  
  const data = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp.toString(),
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
      'locale': 'en-US'
    }
  });
  
  if (data.code !== '00000') {
    throw new Error(data.msg || `Error code: ${data.code}`);
  }
  
  // 计算 USDT 余额
  let balance = 0;
  if (data.data && data.data[0]) {
    balance = parseFloat(data.data[0].usdtEquity || data.data[0].available || 0);
  }
  
  return {
    success: true,
    balance: parseFloat(balance.toFixed(2)),
    permissions: ['futures']
  };
}

/**
 * 测试交易所连接并获取余额
 */
async function testExchangeConnection(exchangeId, apiKey, apiSecret, passphrase = '') {
  try {
    console.log(`Testing ${exchangeId} connection...`);
    
    switch (exchangeId) {
      case 'binance':
        return await testBinanceConnection(apiKey, apiSecret);
      case 'okx':
        return await testOkxConnection(apiKey, apiSecret, passphrase);
      case 'bybit':
        return await testBybitConnection(apiKey, apiSecret);
      case 'bitget':
        return await testBitgetConnection(apiKey, apiSecret, passphrase);
      default:
        throw new Error(`不支持的交易所: ${exchangeId}`);
    }
  } catch (error) {
    console.error('Exchange connection error:', error.message);
    
    // 解析错误信息
    let message = 'API 连接失败';
    const errMsg = error.message || '';
    
    if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNRESET')) {
      message = '连接超时，请检查网络';
    } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
      message = '无法连接到交易所服务器';
    } else if (errMsg.includes('Invalid API') || errMsg.includes('-2015') || errMsg.includes('-1022')) {
      message = 'API Key 或 Secret 无效';
    } else if (errMsg.includes('Signature') || errMsg.includes('signature')) {
      message = 'API Secret 错误';
    } else if (errMsg.includes('IP') || errMsg.includes('whitelist')) {
      message = 'IP 未在白名单';
    } else if (errMsg.includes('permission') || errMsg.includes('Permission')) {
      message = 'API 权限不足';
    } else if (errMsg.includes('passphrase') || errMsg.includes('Passphrase')) {
      message = 'Passphrase 错误';
    } else if (errMsg) {
      message = errMsg.slice(0, 100);
    }
    
    return {
      success: false,
      message
    };
  }
}

/**
 * 获取账户余额
 */
async function getBalance(exchangeId, apiKey, apiSecret, passphrase = '') {
  const result = await testExchangeConnection(exchangeId, apiKey, apiSecret, passphrase);
  return result.success ? result.balance : 0;
}

module.exports = {
  testExchangeConnection,
  getBalance,
  EXCHANGE_CONFIG
};
