const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  totalReceived: {
    type: Number,
    default: 0
  },
  lastReceivedAt: Date,
  // 统计信息
  stats: {
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    lastSuccess: Date,
    lastFail: Date
  }
}, { 
  timestamps: true 
});

// 增加接收计数
webhookSchema.methods.incrementReceived = function(success = true) {
  this.totalReceived += 1;
  this.lastReceivedAt = new Date();
  if (success) {
    this.stats.successCount += 1;
    this.stats.lastSuccess = new Date();
  } else {
    this.stats.failCount += 1;
    this.stats.lastFail = new Date();
  }
  return this.save();
};

// 生成 webhook URL
webhookSchema.methods.getUrl = function() {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://tvtrade.io';
  return `${baseUrl}/webhook/${this.token}`;
};

module.exports = mongoose.model('Webhook', webhookSchema);
