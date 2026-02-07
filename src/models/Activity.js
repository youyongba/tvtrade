const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'config_saved',
      'config_loaded', 
      'config_deleted',
      'tp_triggered',
      'sl_triggered',
      'order_executed',
      'order_failed',
      'position_opened',
      'position_closed',
      'exchange_connected',
      'webhook_received'
    ],
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  symbol: {
    type: String,
    uppercase: true,
    trim: true
  },
  amount: {
    type: Number,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true 
});

// 复合索引：按用户和时间查询
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ user: 1, type: 1, createdAt: -1 });

// 静态方法：创建活动记录
activitySchema.statics.log = async function(userId, type, title, options = {}) {
  return await this.create({
    user: userId,
    type,
    title,
    symbol: options.symbol,
    amount: options.amount,
    metadata: options.metadata
  });
};

// 静态方法：获取用户最近活动
activitySchema.statics.getRecent = async function(userId, limit = 20) {
  return await this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Activity', activitySchema);
