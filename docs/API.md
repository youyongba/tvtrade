# TVTrade RESTful API 文档

Base URL: `https://xxx.com/api/v1`

---

## 1. 用户认证模块 `/api/auth`

### 1.1 用户注册
```
POST /api/auth/register
```

**Request Body:**
```json
{
  "username": "trader001",
  "email": "trader@example.com",
  "password": "password123"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "username": "trader001",
      "email": "trader@example.com",
      "createdAt": "2026-01-26T10:00:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "webhook": {
      "url": "https://tvtrade.io/webhook/wh_xyz789",
      "token": "wh_xyz789"
    }
  }
}
```

### 1.2 用户登录
```
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "trader@example.com",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "username": "trader001",
      "email": "trader@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 1.3 获取当前用户信息
```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "usr_abc123",
    "username": "trader001",
    "email": "trader@example.com",
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

### 1.4 退出登录
```
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "message": "已退出登录"
}
```

### 1.5 找回密码（发送重置邮件）
```
POST /api/auth/forgot-password
```

**Request Body:**
```json
{
  "email": "trader@example.com"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "重置密码邮件已发送"
}
```

### 1.6 验证重置令牌
```
GET /api/auth/reset-password/:token
```

**Response 200:**
```json
{
  "success": true,
  "message": "令牌有效",
  "data": {
    "email": "tra***@example.com"
  }
}
```

**Response 400 (令牌无效或过期):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "重置令牌无效或已过期"
  }
}
```

### 1.7 重置密码
```
POST /api/auth/reset-password/:token
```

**Request Body:**
```json
{
  "password": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "密码重置成功"
}
```

---

## 2. 交易所配置模块 `/api/exchanges`

### 2.1 获取支持的交易所列表
```
GET /api/exchanges/supported
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "binance", "name": "Binance Futures", "requiresPassphrase": false },
    { "id": "okx", "name": "OKX", "requiresPassphrase": true },
    { "id": "bybit", "name": "Bybit", "requiresPassphrase": false },
    { "id": "bitget", "name": "Bitget", "requiresPassphrase": true }
  ]
}
```

### 2.2 保存交易所配置
```
POST /api/exchanges
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "exchange": "binance",
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret",
  "passphrase": ""
}
```

**说明:** 保存配置时会自动测试连接并获取余额。

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "exc_123",
    "exchange": "binance",
    "apiKey": "your***_key",
    "connected": true,
    "balance": 12450.00,
    "permissions": ["futures"],
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

### 2.3 获取用户交易所配置
```
GET /api/exchanges
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "exc_123",
    "exchange": "binance",
    "apiKey": "your_api_***",
    "connected": true,
    "balance": 12450.00,
    "updatedAt": "2026-01-26T10:00:00Z"
  }
}
```

### 2.4 测试交易所连接
```
POST /api/exchanges/test
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "exchange": "binance",
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret",
  "passphrase": ""
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "balance": 12450.00,
    "permissions": ["spot", "futures"]
  }
}
```

### 2.5 刷新交易所余额
```
POST /api/exchanges/refresh-balance
Authorization: Bearer <token>
```

**说明:** 实时查询交易所 API 获取最新余额（不需要传入 API 密钥，使用已保存的配置）。

**Response 200:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "balance": 12580.50,
    "permissions": ["futures"],
    "updatedAt": "2026-01-26T12:00:00Z"
  }
}
```

**Response 200 (连接失败):**
```json
{
  "success": false,
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "API 连接失败"
  }
}
```

### 2.6 删除交易所配置
```
DELETE /api/exchanges/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "message": "交易所配置已删除"
}
```

---

## 3. Webhook 模块 `/api/webhook`

### 3.1 获取用户 Webhook 信息
```
GET /api/webhook
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://tvtrade.io/webhook/wh_xyz789",
    "token": "wh_xyz789",
    "status": "active",
    "lastReceived": "2026-01-26T09:55:00Z",
    "totalReceived": 156,
    "createdAt": "2026-01-20T10:00:00Z"
  }
}
```

### 3.2 重新生成 Webhook
```
POST /api/webhook/regenerate
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://tvtrade.io/webhook/wh_newtoken123",
    "token": "wh_newtoken123",
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

### 3.3 接收 TradingView Webhook (公开接口)
```
POST /webhook/:token
```

**开仓消息示例 (分批开仓):**
```json
{
  "token": "wh_xyz789",
  "action": "open_long",
  "symbol": "BTCUSDT",
  "leverage": 20,
  "position_size": "30%",
  "order_type": "market",
  "entry_index": 1
}
```

**止盈消息示例:**
```json
{
  "token": "wh_xyz789",
  "action": "close_long",
  "symbol": "BTCUSDT",
  "close_percent": "50%",
  "order_type": "market",
  "tp_index": 1
}
```

**止损消息示例:**
```json
{
  "token": "wh_xyz789",
  "action": "close_long",
  "symbol": "BTCUSDT",
  "close_percent": "100%",
  "order_type": "market",
  "sl_index": 1
}
```

**保护性止损消息示例:**
```json
{
  "token": "wh_xyz789",
  "action": "protection_sl",
  "symbol": "BTCUSDT",
  "close_percent": "100%",
  "order_type": "market"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "orderId": "ord_123456",
    "action": "open_long",
    "symbol": "BTCUSDT",
    "status": "executed",
    "executedAt": "2026-01-26T10:00:01Z"
  }
}
```

### Webhook 字段说明

| 字段 | 类型 | 说明 |
| -------- | -------- | -------- |
| token | string | 用户唯一 Webhook 令牌 |
| action | string | 操作类型: open_long, open_short, close_long, close_short, protection_sl |
| symbol | string | 交易对，如 BTCUSDT |
| leverage | number | 杠杆倍数 (仅开仓) |
| position_size | string | 仓位大小百分比 (仅开仓) |
| close_percent | string | 平仓百分比 (仅平仓) |
| order_type | string | 订单类型: market 或 limit |
| entry_index | number | 开仓索引 (分批开仓时使用) |
| tp_index | number | 止盈索引 |
| sl_index | number | 止损索引 |

---

## 4. 交易配置模块 `/api/configs`

### 4.1 获取所有配置
```
GET /api/configs
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): 页码, 默认 1
- `limit` (optional): 每页数量, 默认 20

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cfg_001",
      "name": "BTCUSDT 做多 20x",
      "symbol": "BTCUSDT",
      "direction": "long",
      "orderType": "market",
      "leverage": 20,
      "positionSize": 30,
      "takeProfits": [
        { "id": 1, "closePercent": "50", "orderType": "market", "enabled": true },
        { "id": 2, "closePercent": "30", "orderType": "market", "enabled": true },
        { "id": 3, "closePercent": "20", "orderType": "market", "enabled": true }
      ],
      "stopLosses": [
        { "id": 1, "closePercent": "100", "orderType": "market", "enabled": true }
      ],
      "protectionSL": true,
      "protectionOrderType": "market",
      "createdAt": "2026-01-26T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

### 4.2 获取单个配置
```
GET /api/configs/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "cfg_001",
    "name": "BTCUSDT 做多 20x",
    "symbol": "BTCUSDT",
    "direction": "long",
    "orderType": "market",
    "leverage": 20,
    "positionSize": 30,
    "takeProfits": [...],
    "stopLosses": [...],
    "protectionSL": true,
    "protectionOrderType": "market",
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

### 4.3 创建配置
```
POST /api/configs
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "BTCUSDT 做多 20x",
  "symbol": "BTCUSDT",
  "direction": "long",
  "orderType": "market",
  "leverage": 20,
  "positionSize": 30,
  "takeProfits": [
    { "closePercent": "50", "orderType": "market", "enabled": true },
    { "closePercent": "30", "orderType": "market", "enabled": true },
    { "closePercent": "20", "orderType": "market", "enabled": true }
  ],
  "stopLosses": [
    { "closePercent": "100", "orderType": "market", "enabled": true }
  ],
  "protectionSL": true,
  "protectionOrderType": "market"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "cfg_001",
    "name": "BTCUSDT 做多 20x",
    ...
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

### 4.4 更新配置
```
PUT /api/configs/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "leverage": 25,
  "positionSize": 40
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "cfg_001",
    "leverage": 25,
    "positionSize": 40,
    "updatedAt": "2026-01-26T11:00:00Z"
  }
}
```

### 4.5 删除配置
```
DELETE /api/configs/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "message": "配置已删除"
}
```

### 4.6 清空所有配置
```
DELETE /api/configs
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "message": "已清空所有配置",
  "deletedCount": 5
}
```

---

## 5. 活动记录模块 `/api/activities`

### 5.1 获取活动记录
```
GET /api/activities
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): 页码, 默认 1
- `limit` (optional): 每页数量, 默认 20
- `type` (optional): 类型过滤 (config_saved, config_loaded, tp_triggered, sl_triggered)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "act_001",
      "type": "config_saved",
      "title": "保存配置: BTCUSDT 做多 20x",
      "symbol": "BTCUSDT",
      "amount": null,
      "createdAt": "2026-01-26T10:00:00Z"
    },
    {
      "id": "act_002",
      "type": "tp_triggered",
      "title": "止盈触发 平50%仓",
      "symbol": "BTCUSDT",
      "amount": 125.50,
      "createdAt": "2026-01-26T09:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### 5.2 清空活动记录
```
DELETE /api/activities
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "message": "已清空活动记录",
  "deletedCount": 50
}
```

---

## 6. 持仓模块 `/api/positions`

### 6.1 获取当前持仓
```
GET /api/positions
Authorization: Bearer <token>
```

**Query Parameters:**
- `symbol` (optional): 交易对过滤

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pos_001",
      "symbol": "BTCUSDT",
      "direction": "long",
      "leverage": 20,
      "entryPrice": 42150.50,
      "currentPrice": 43285.20,
      "quantity": 0.156,
      "margin": 328.50,
      "unrealizedPnl": 177.08,
      "unrealizedPnlPercent": 53.90,
      "liquidationPrice": 40125.00,
      "openedAt": "2026-01-26T08:00:00Z"
    }
  ]
}
```

### 6.2 获取单个持仓详情
```
GET /api/positions/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "pos_001",
    "symbol": "BTCUSDT",
    ...
  }
}
```

### 6.3 平仓
```
POST /api/positions/:id/close
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "closePercent": 100,
  "orderType": "market"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "orderId": "ord_789",
    "symbol": "BTCUSDT",
    "closePercent": 100,
    "realizedPnl": 177.08,
    "closedAt": "2026-01-26T12:00:00Z"
  }
}
```

---

## 7. 订单模块 `/api/orders`

### 7.1 获取订单历史
```
GET /api/orders
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): 页码
- `limit` (optional): 每页数量
- `symbol` (optional): 交易对过滤
- `status` (optional): 状态过滤 (pending, executed, cancelled, failed)
- `startDate` (optional): 开始日期
- `endDate` (optional): 结束日期

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ord_001",
      "symbol": "BTCUSDT",
      "action": "open_long",
      "orderType": "market",
      "leverage": 20,
      "quantity": 0.156,
      "price": 42150.50,
      "status": "executed",
      "source": "webhook",
      "webhookTrigger": "tp_1",
      "createdAt": "2026-01-26T08:00:00Z",
      "executedAt": "2026-01-26T08:00:01Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 7.2 获取订单详情
```
GET /api/orders/:id
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "ord_001",
    "symbol": "BTCUSDT",
    "action": "open_long",
    ...
  }
}
```

---

## 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "认证失败，请重新登录"
  }
}
```

### 错误码列表

| HTTP Status | Code | 描述 |
|-------------|------|------|
| 400 | BAD_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证或 Token 过期 |
| 403 | FORBIDDEN | 无权限访问 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突 (如邮箱已注册) |
| 422 | VALIDATION_ERROR | 数据验证失败 |
| 429 | RATE_LIMITED | 请求过于频繁 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 认证方式

所有需要认证的接口必须在 Header 中携带 JWT Token：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Token 有效期：7 天


## 总览

按页面模块划分为 7 个模块：

| 模块 | 路径 | 接口数 |
| -------- | -------- | --------: |
| 用户认证 | /api/auth | 7 |
| 交易所配置 | /api/exchanges | 6 |
| Webhook | /api/webhook | 3 |
| 交易配置 | /api/configs | 6 |
| 活动记录 | /api/activities | 2 |
| 持仓 | /api/positions | 3 |
| 订单 | /api/orders | 2 |

**共 29 个 API 接口**，包含统一错误响应格式和 JWT 认证说明。

### 已实现接口

| 模块 | 接口 | 状态 |
| -------- | -------- | :--------: |
| 用户认证 | 注册、登录、退出、获取用户信息、找回密码、重置密码 | ✅ |
| 交易所配置 | 获取支持列表、保存配置、获取配置、测试连接、刷新余额、删除配置 | ✅ |
| Webhook | 获取 Webhook、重新生成 | ✅ |
| 交易配置 | CRUD 操作 | 📋 待实现 |
| 活动记录 | 获取/清空记录 | 📋 待实现 |
| 持仓 | 获取/平仓 | 📋 待实现 |
| 订单 | 获取历史/详情 | 📋 待实现 |