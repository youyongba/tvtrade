const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
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
  direction: {
    type: String,
    required: true,
    enum: ['long', 'short']
  },
  leverage: {
    type: Number,
    required: true,
    min: 1,
    max: 125
  },
  entryPrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    required: true
  },
  margin: {
    type: Number,
    required: true
  },
  unrealizedPnl: {
    type: Number,
    default: 0
  },
  unrealizedPnlPercent: {
    type: Number,
    default: 0
  },
  liquidationPrice: {
    type: Number
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'liquidated'],
    default: 'open',
    index: true
  },
  // 平仓信息
  closePrice: Number,
  realizedPnl: Number,
  closedAt: Date,
  closeReason: {
    type: String,
    enum: ['manual', 'take_profit', 'stop_loss', 'liquidation', null]
  },
  // 关联配置
  config: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Config'
  },
  // 交易所订单ID
  exchangePositionId: String,
  openedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// 复合索引
positionSchema.index({ user: 1, status: 1 });
positionSchema.index({ user: 1, symbol: 1, status: 1 });

// 计算未实现盈亏
positionSchema.methods.calculatePnl = function() {
  if (!this.currentPrice || !this.entryPrice) return;
  
  const priceDiff = this.direction === 'long' 
    ? this.currentPrice - this.entryPrice
    : this.entryPrice - this.currentPrice;
  
  const pnlPercent = (priceDiff / this.entryPrice) * this.leverage * 100;
  const pnlAmount = this.margin * (priceDiff / this.entryPrice) * this.leverage;
  
  this.unrealizedPnl = Math.round(pnlAmount * 100) / 100;
  this.unrealizedPnlPercent = Math.round(pnlPercent * 100) / 100;
  
  return { pnl: this.unrealizedPnl, percent: this.unrealizedPnlPercent };
};

// 平仓
positionSchema.methods.close = function(closePrice, reason = 'manual') {
  this.status = 'closed';
  this.closePrice = closePrice;
  this.closedAt = new Date();
  this.closeReason = reason;
  
  const priceDiff = this.direction === 'long' 
    ? closePrice - this.entryPrice
    : this.entryPrice - closePrice;
  
  this.realizedPnl = Math.round(this.margin * (priceDiff / this.entryPrice) * this.leverage * 100) / 100;
  
  return this.save();
};

module.exports = mongoose.model('Position', positionSchema);
