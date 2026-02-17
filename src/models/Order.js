const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  exchange: {
    type: String,
    required: true,
    enum: ['binance', 'okx', 'bybit', 'bitget']
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'open_long',
      'open_short', 
      'close_long',
      'close_short',
      'take_profit',
      'stop_loss',
      'protection_sl'
    ]
  },
  orderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  leverage: {
    type: Number,
    min: 1,
    max: 125
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number
  },
  executedPrice: {
    type: Number
  },
  status: {
    type: String,
    enum: ['pending', 'executed', 'cancelled', 'failed', 'partial'],
    default: 'pending',
    index: true
  },
  source: {
    type: String,
    enum: ['webhook', 'manual', 'system'],
    default: 'webhook'
  },
  webhookTrigger: {
    type: String  // e.g., 'tp_1', 'sl_1', 'open'
  },
  // 交易所返回信息
  exchangeOrderId: String,
  exchangeResponse: mongoose.Schema.Types.Mixed,
  // 错误信息
  errorCode: String,
  errorMessage: String,
  // 关联
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position'
  },
  config: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Config'
  },
  // 执行时间
  executedAt: Date
}, { 
  timestamps: true 
});

// 复合索引
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ user: 1, symbol: 1, createdAt: -1 });
orderSchema.index({ user: 1, status: 1, createdAt: -1 });

// 标记为已执行
orderSchema.methods.markExecuted = function(executedPrice, exchangeOrderId, exchangeResponse) {
  this.status = 'executed';
  this.executedPrice = executedPrice;
  this.exchangeOrderId = exchangeOrderId;
  this.exchangeResponse = exchangeResponse;
  this.executedAt = new Date();
  return this.save();
};

// 标记为失败
orderSchema.methods.markFailed = function(errorCode, errorMessage) {
  this.status = 'failed';
  this.errorCode = errorCode;
  this.errorMessage = errorMessage;
  return this.save();
};

// 静态方法：获取用户订单历史
orderSchema.statics.getHistory = async function(userId, options = {}) {
  const { page = 1, limit = 20, symbol, status, startDate, endDate } = options;
  
  const query = { user: userId };
  if (symbol) query.symbol = symbol.toUpperCase();
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const total = await this.countDocuments(query);
  const orders = await this.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  
  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

module.exports = mongoose.model('Order', orderSchema);
