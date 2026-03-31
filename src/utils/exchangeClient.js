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

// 发起 HTTPS 请求（支持 POST body）
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const agent = getProxyAgent();
    const body = options.body || '';
    
    const reqOptions = {
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      },
      agent: agent,
      timeout: 30000
    };
    
    const req = https.request(reqOptions, (res) => {
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
    
    if (body) {
      req.write(body);
    }
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

// ==========================================================
// 交易功能
// ==========================================================

/**
 * 获取 Binance Futures 最新价格
 */
async function getBinancePrice(symbol) {
  const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
  const data = await httpsRequest(url, { method: 'GET' });
  if (data.code) {
    throw new Error(data.msg || `获取价格失败: ${data.code}`);
  }
  return parseFloat(data.price);
}

/**
 * 获取 Binance Futures 交易对信息（精度等）
 */
async function getBinanceSymbolInfo(symbol) {
  const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const data = await httpsRequest(url, { method: 'GET' });
  if (data.code) {
    throw new Error(data.msg || `获取交易对信息失败: ${data.code}`);
  }
  const symbolInfo = data.symbols.find(s => s.symbol === symbol);
  if (!symbolInfo) {
    throw new Error(`交易对 ${symbol} 不存在`);
  }
  
  // 获取精度
  const pricePrecision = symbolInfo.pricePrecision;
  const quantityPrecision = symbolInfo.quantityPrecision;
  const minQty = parseFloat(symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE')?.minQty || 0.001);
  
  return { pricePrecision, quantityPrecision, minQty };
}

/**
 * 设置 Binance Futures 杠杆
 */
async function setBinanceLeverage(apiKey, apiSecret, symbol, leverage) {
  const config = EXCHANGE_CONFIG.binance;
  const serverTime = await getBinanceServerTime();
  
  const params = `symbol=${symbol}&leverage=${leverage}&timestamp=${serverTime}&recvWindow=60000`;
  const signature = createSignature(params, apiSecret);
  
  const url = `${config.baseUrl}/fapi/v1/leverage?${params}&signature=${signature}`;
  
  const data = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (data.code && data.code !== 200) {
    // -4028: 杠杆已设置，忽略
    if (data.code !== -4028) {
      console.log(`设置杠杆响应: ${JSON.stringify(data)}`);
    }
  }
  
  console.log(`✅ 设置杠杆: ${symbol} ${leverage}x`);
  return { success: true, leverage: data.leverage || leverage };
}

/**
 * 设置 Binance Futures 持仓模式（双向持仓）
 */
async function setBinancePositionMode(apiKey, apiSecret, dualSidePosition = true) {
  const config = EXCHANGE_CONFIG.binance;
  const serverTime = await getBinanceServerTime();
  
  const params = `dualSidePosition=${dualSidePosition}&timestamp=${serverTime}&recvWindow=60000`;
  const signature = createSignature(params, apiSecret);
  
  const url = `${config.baseUrl}/fapi/v1/positionSide/dual?${params}&signature=${signature}`;
  
  const data = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  // -4059: 已经是该模式，忽略
  if (data.code && data.code !== -4059) {
    console.log(`设置持仓模式响应: ${JSON.stringify(data)}`);
  }
  
  return { success: true };
}

/**
 * Binance Futures 下单
 * @param {string} apiKey
 * @param {string} apiSecret
 * @param {object} orderParams - { symbol, side, positionSide, type, quantity, price? }
 */
async function placeBinanceOrder(apiKey, apiSecret, orderParams) {
  const config = EXCHANGE_CONFIG.binance;
  const serverTime = await getBinanceServerTime();
  
  const { symbol, side, positionSide, type, quantity, price, reduceOnly } = orderParams;
  
  let params = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${serverTime}&recvWindow=60000`;
  
  // 双向持仓模式需要 positionSide
  if (positionSide) {
    params += `&positionSide=${positionSide}`;
  }
  
  // 限价单需要价格和 timeInForce
  if (type === 'LIMIT' && price) {
    params += `&price=${price}&timeInForce=GTC`;
  }
  
  // 平仓时可能需要 reduceOnly
  if (reduceOnly) {
    params += `&reduceOnly=true`;
  }
  
  const signature = createSignature(params, apiSecret);
  const url = `${config.baseUrl}/fapi/v1/order?${params}&signature=${signature}`;
  
  console.log(`📤 Binance 下单请求: ${side} ${symbol} ${quantity} @ ${type}${price ? ` ${price}` : ''}`);
  
  const data = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (data.code) {
    console.error(`❌ Binance 下单失败:`, data);
    throw new Error(data.msg || `下单失败: ${data.code}`);
  }
  
  console.log(`✅ Binance 下单成功:`, JSON.stringify(data));
  
  return {
    success: true,
    orderId: data.orderId,
    clientOrderId: data.clientOrderId,
    symbol: data.symbol,
    side: data.side,
    type: data.type,
    status: data.status,
    executedQty: parseFloat(data.executedQty || 0),
    avgPrice: parseFloat(data.avgPrice || data.price || 0),
    origQty: parseFloat(data.origQty || quantity),
    raw: data
  };
}

/**
 * Binance Futures 开仓
 */
async function openBinancePosition(apiKey, apiSecret, params) {
  const { symbol, direction, leverage, positionSizePercent, balance, orderType = 'MARKET' } = params;
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BINANCE FUTURES 开仓');
  console.log('='.repeat(60));
  console.log(`交易对: ${symbol}, 方向: ${direction}, 杠杆: ${leverage}x`);
  console.log(`仓位比例: ${positionSizePercent}%, 余额: ${balance} USDT, 订单类型: ${orderType}`);
  
  // 1. 设置杠杆
  await setBinanceLeverage(apiKey, apiSecret, symbol, leverage);
  
  // 2. 获取当前价格
  const price = await getBinancePrice(symbol);
  console.log(`当前价格: ${price}`);
  
  // 3. 获取交易对精度
  const symbolInfo = await getBinanceSymbolInfo(symbol);
  console.log(`精度: 价格=${symbolInfo.pricePrecision}, 数量=${symbolInfo.quantityPrecision}, 最小数量=${symbolInfo.minQty}`);
  
  // 4. 计算下单数量
  const margin = balance * positionSizePercent / 100;
  const notional = margin * leverage;
  let quantity = notional / price;
  
  // 调整精度
  quantity = Math.floor(quantity * Math.pow(10, symbolInfo.quantityPrecision)) / Math.pow(10, symbolInfo.quantityPrecision);
  
  if (quantity < symbolInfo.minQty) {
    throw new Error(`下单数量 ${quantity} 小于最小数量 ${symbolInfo.minQty}`);
  }
  
  console.log(`计算: 保证金=${margin.toFixed(2)} USDT, 名义价值=${notional.toFixed(2)} USDT, 数量=${quantity}`);
  
  // 5. 下单
  const side = direction === 'long' ? 'BUY' : 'SELL';
  const positionSide = direction === 'long' ? 'LONG' : 'SHORT';
  
  const orderResult = await placeBinanceOrder(apiKey, apiSecret, {
    symbol,
    side,
    positionSide,
    type: orderType,
    quantity: quantity.toString()
  });
  
  console.log('='.repeat(60) + '\n');
  
  return {
    success: true,
    orderId: orderResult.orderId,
    symbol,
    direction,
    leverage,
    entryPrice: orderResult.avgPrice || price,
    quantity: orderResult.executedQty || quantity,
    margin,
    status: orderResult.status,
    raw: orderResult.raw
  };
}

/**
 * Binance Futures 平仓
 */
async function closeBinancePosition(apiKey, apiSecret, params) {
  const { symbol, direction, quantity, closePercent = 100, orderType = 'MARKET' } = params;
  
  console.log('\n' + '='.repeat(60));
  console.log('📉 BINANCE FUTURES 平仓');
  console.log('='.repeat(60));
  console.log(`交易对: ${symbol}, 方向: ${direction}, 平仓比例: ${closePercent}%`);
  
  // 1. 获取当前价格
  const price = await getBinancePrice(symbol);
  console.log(`当前价格: ${price}`);
  
  // 2. 获取交易对精度
  const symbolInfo = await getBinanceSymbolInfo(symbol);
  
  // 3. 计算平仓数量
  let closeQuantity;
  
  if (closePercent >= 100) {
    // 100% 平仓，直接使用原始数量（不做精度处理，避免丢失）
    closeQuantity = quantity;
    console.log(`全部平仓: ${closeQuantity}`);
  } else {
    // 部分平仓，需要精度处理
    closeQuantity = quantity * closePercent / 100;
    // 使用 toFixed 而不是 floor，避免丢失精度
    closeQuantity = parseFloat(closeQuantity.toFixed(symbolInfo.quantityPrecision));
    
    if (closeQuantity < symbolInfo.minQty) {
      closeQuantity = symbolInfo.minQty;
    }
    console.log(`部分平仓: ${closeQuantity} (${closePercent}% of ${quantity})`);
  }
  
  console.log(`平仓数量: ${closeQuantity} (原持仓: ${quantity})`);
  
  // 4. 下单（平仓方向相反）
  const side = direction === 'long' ? 'SELL' : 'BUY';
  const positionSide = direction === 'long' ? 'LONG' : 'SHORT';
  
  const orderResult = await placeBinanceOrder(apiKey, apiSecret, {
    symbol,
    side,
    positionSide,
    type: orderType,
    quantity: closeQuantity.toString()
  });
  
  console.log('='.repeat(60) + '\n');
  
  return {
    success: true,
    orderId: orderResult.orderId,
    symbol,
    closePrice: orderResult.avgPrice || price,
    closedQuantity: orderResult.executedQty || closeQuantity,
    status: orderResult.status,
    raw: orderResult.raw
  };
}

/**
 * 统一开仓接口
 */
async function openPosition(exchangeId, apiKey, apiSecret, passphrase, params) {
  console.log(`\n📈 执行开仓: ${exchangeId}`);
  
  switch (exchangeId) {
    case 'binance':
      return await openBinancePosition(apiKey, apiSecret, params);
    case 'okx':
      // TODO: 实现 OKX 开仓
      throw new Error('OKX 开仓功能尚未实现');
    case 'bybit':
      // TODO: 实现 Bybit 开仓
      throw new Error('Bybit 开仓功能尚未实现');
    case 'bitget':
      // TODO: 实现 Bitget 开仓
      throw new Error('Bitget 开仓功能尚未实现');
    default:
      throw new Error(`不支持的交易所: ${exchangeId}`);
  }
}

/**
 * 统一平仓接口
 */
async function closePosition(exchangeId, apiKey, apiSecret, passphrase, params) {
  console.log(`\n📉 执行平仓: ${exchangeId}`);
  
  switch (exchangeId) {
    case 'binance':
      return await closeBinancePosition(apiKey, apiSecret, params);
    case 'okx':
      // TODO: 实现 OKX 平仓
      throw new Error('OKX 平仓功能尚未实现');
    case 'bybit':
      // TODO: 实现 Bybit 平仓
      throw new Error('Bybit 平仓功能尚未实现');
    case 'bitget':
      // TODO: 实现 Bitget 平仓
      throw new Error('Bitget 平仓功能尚未实现');
    default:
      throw new Error(`不支持的交易所: ${exchangeId}`);
  }
}

/**
 * 获取实时价格
 */
async function getPrice(exchangeId, symbol) {
  switch (exchangeId) {
    case 'binance':
      return await getBinancePrice(symbol);
    default:
      throw new Error(`不支持获取 ${exchangeId} 价格`);
  }
}

// ==========================================================
// 保护性止损功能
// ==========================================================

/**
 * Binance Futures 挂止损单（STOP_MARKET）- 使用 Algo Order API
 * 自 2025-12-09 起，条件单必须使用 /fapi/v1/algoOrder 端点
 * 当价格触及 triggerPrice 时，以市价平仓
 */
async function placeBinanceStopOrder(apiKey, apiSecret, params) {
  const config = EXCHANGE_CONFIG.binance;
  const serverTime = await getBinanceServerTime();
  
  const { symbol, side, positionSide, quantity, stopPrice } = params;
  
  // 获取交易对精度信息
  const symbolInfo = await getBinanceSymbolInfo(symbol);
  
  // 格式化触发价格精度
  const formattedTriggerPrice = parseFloat(stopPrice).toFixed(symbolInfo.pricePrecision);
  
  console.log(`📐 精度处理: 触发价=${stopPrice} → ${formattedTriggerPrice}, 价格精度=${symbolInfo.pricePrecision}`);
  
  // 使用 Algo Order API，closePosition=true 平掉该方向的所有剩余仓位
  let queryParams = `algoType=CONDITIONAL&symbol=${symbol}&side=${side}&type=STOP_MARKET&closePosition=true&triggerPrice=${formattedTriggerPrice}&timestamp=${serverTime}&recvWindow=60000`;
  
  // 双向持仓模式需要 positionSide
  if (positionSide) {
    queryParams += `&positionSide=${positionSide}`;
  }
  
  const signature = createSignature(queryParams, apiSecret);
  const url = `${config.baseUrl}/fapi/v1/algoOrder?${queryParams}&signature=${signature}`;
  
  console.log(`📤 Binance Algo Order 挂止损单: ${side} ${symbol} closePosition=true @ STOP_MARKET 触发价=${formattedTriggerPrice}`);
  
  const data = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (data.code && data.code !== 200) {
    console.error(`❌ Binance Algo Order 挂止损单失败:`, data);
    throw new Error(data.msg || `挂止损单失败: ${data.code}`);
  }
  
  console.log(`✅ Binance Algo Order 止损单挂单成功:`, JSON.stringify(data));
  
  return {
    success: true,
    orderId: data.algoId,
    clientOrderId: data.clientAlgoId,
    symbol: data.symbol,
    side: data.side,
    type: data.orderType || 'STOP_MARKET',
    status: data.algoStatus || 'NEW',
    stopPrice: parseFloat(data.triggerPrice || formattedTriggerPrice),
    raw: data
  };
}

/**
 * Binance Futures 挂保护性止损单（在成本价/开仓价）
 * @param {string} apiKey
 * @param {string} apiSecret
 * @param {object} params - { symbol, direction, quantity, entryPrice, orderType }
 */
async function placeBinanceProtectionSL(apiKey, apiSecret, params) {
  const { symbol, direction, quantity, entryPrice, orderType = 'STOP_MARKET' } = params;
  
  console.log('\n' + '='.repeat(60));
  console.log('🛡️  BINANCE FUTURES 挂保护性止损单');
  console.log('='.repeat(60));
  console.log(`交易对: ${symbol}, 方向: ${direction}`);
  console.log(`数量: ${quantity}, 开仓价(止损触发价): ${entryPrice}`);
  
  // 平仓方向与持仓方向相反
  const side = direction === 'long' ? 'SELL' : 'BUY';
  const positionSide = direction === 'long' ? 'LONG' : 'SHORT';
  
  const result = await placeBinanceStopOrder(apiKey, apiSecret, {
    symbol,
    side,
    positionSide,
    quantity: quantity.toString(),
    stopPrice: entryPrice
  });
  
  console.log('='.repeat(60) + '\n');
  
  return result;
}

/**
 * 统一挂保护性止损单接口
 */
async function placeProtectionStopLoss(exchangeId, apiKey, apiSecret, passphrase, params) {
  console.log(`\n🛡️  挂保护性止损单: ${exchangeId}`);
  
  switch (exchangeId) {
    case 'binance':
      return await placeBinanceProtectionSL(apiKey, apiSecret, params);
    case 'okx':
      // TODO: 实现 OKX 保护性止损
      throw new Error('OKX 保护性止损功能尚未实现');
    case 'bybit':
      // TODO: 实现 Bybit 保护性止损
      throw new Error('Bybit 保护性止损功能尚未实现');
    case 'bitget':
      // TODO: 实现 Bitget 保护性止损
      throw new Error('Bitget 保护性止损功能尚未实现');
    default:
      throw new Error(`不支持的交易所: ${exchangeId}`);
  }
}

/**
 * 取消所有止损单（用于平仓后清理）
 * 同时检查传统挂单和 Algo 条件单
 */
async function cancelBinanceStopOrders(apiKey, apiSecret, symbol) {
  const config = EXCHANGE_CONFIG.binance;
  let cancelled = 0;

  // 1. 检查并取消传统挂单中的止损单
  try {
    const serverTime1 = await getBinanceServerTime();
    const params1 = `symbol=${symbol}&timestamp=${serverTime1}&recvWindow=60000`;
    const sig1 = createSignature(params1, apiSecret);
    const openOrdersUrl = `${config.baseUrl}/fapi/v1/openOrders?${params1}&signature=${sig1}`;
    const openOrders = await httpsRequest(openOrdersUrl, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    if (!openOrders.code && Array.isArray(openOrders)) {
      const stopOrders = openOrders.filter(o =>
        o.type === 'STOP_MARKET' || o.type === 'STOP' || o.type === 'STOP_LOSS'
      );
      for (const order of stopOrders) {
        const cancelParams = `symbol=${symbol}&orderId=${order.orderId}&timestamp=${await getBinanceServerTime()}&recvWindow=60000`;
        const cancelSig = createSignature(cancelParams, apiSecret);
        const cancelUrl = `${config.baseUrl}/fapi/v1/order?${cancelParams}&signature=${cancelSig}`;
        const cancelResult = await httpsRequest(cancelUrl, {
          method: 'DELETE',
          headers: { 'X-MBX-APIKEY': apiKey }
        });
        if (!cancelResult.code) {
          cancelled++;
          console.log(`✅ 已取消传统止损单: ${order.orderId}`);
        }
      }
    }
  } catch (err) {
    console.log('检查传统挂单失败:', err.message);
  }

  // 2. 检查并取消 Algo 条件单中的止损单
  try {
    const serverTime2 = await getBinanceServerTime();
    const params2 = `symbol=${symbol}&timestamp=${serverTime2}&recvWindow=60000`;
    const sig2 = createSignature(params2, apiSecret);
    const algoOrdersUrl = `${config.baseUrl}/fapi/v1/allAlgoOrders?${params2}&signature=${sig2}`;
    const algoOrders = await httpsRequest(algoOrdersUrl, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    if (!algoOrders.code && Array.isArray(algoOrders)) {
      const activeAlgoStops = algoOrders.filter(o =>
        o.algoStatus === 'NEW' &&
        (o.orderType === 'STOP_MARKET' || o.orderType === 'STOP')
      );
      for (const order of activeAlgoStops) {
        const cancelParams = `algoId=${order.algoId}&timestamp=${await getBinanceServerTime()}&recvWindow=60000`;
        const cancelSig = createSignature(cancelParams, apiSecret);
        const cancelUrl = `${config.baseUrl}/fapi/v1/algoOrder?${cancelParams}&signature=${cancelSig}`;
        const cancelResult = await httpsRequest(cancelUrl, {
          method: 'DELETE',
          headers: { 'X-MBX-APIKEY': apiKey }
        });
        if (cancelResult.code === '200' || cancelResult.code === 200 || !cancelResult.code) {
          cancelled++;
          console.log(`✅ 已取消 Algo 止损单: ${order.algoId}`);
        }
      }
    }
  } catch (err) {
    console.log('检查 Algo 挂单失败:', err.message);
  }

  if (cancelled === 0) {
    console.log('没有需要取消的止损单');
  } else {
    console.log(`共取消 ${cancelled} 个止损单`);
  }

  return { success: true, cancelled };
}

module.exports = {
  testExchangeConnection,
  getBalance,
  openPosition,
  closePosition,
  getPrice,
  placeProtectionStopLoss,
  cancelBinanceStopOrders,
  EXCHANGE_CONFIG
};
