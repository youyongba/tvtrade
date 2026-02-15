const mongoose = require('mongoose');

// 开仓子文档 Schema (分批开仓)
const entrySchema = new mongoose.Schema({
  positionSize: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        const num = parseFloat(v);
        return !isNaN(num) && num > 0 && num <= 100;
      },
      message: '仓位比例必须在 1-100 之间'
    }
  },
  orderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: true });

// 止盈/止损子文档 Schema
const tpslSchema = new mongoose.Schema({
  closePercent: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        const num = parseFloat(v);
        return !isNaN(num) && num > 0 && num <= 100;
      },
      message: '平仓比例必须在 1-100 之间'
    }
  },
  orderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const configSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, '配置名称不能为空'],
    trim: true,
    maxlength: [100, '配置名称最多100个字符']
  },
  symbol: {
    type: String,
    required: [true, '交易对不能为空'],
    uppercase: true,
    trim: true
  },
  direction: {
    type: String,
    required: true,
    enum: {
      values: ['long', 'short'],
      message: '方向只能是 long 或 short'
    }
  },
  leverage: {
    type: Number,
    required: true,
    min: [1, '杠杆至少为 1'],
    max: [125, '杠杆最大为 125']
  },
  // 分批开仓配置
  entries: [entrySchema],
  // 以下两个字段保留用于向后兼容旧配置
  orderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  positionSize: {
    type: Number,
    min: [1, '仓位比例至少为 1%'],
    max: [100, '仓位比例最大为 100%']
  },
  takeProfits: [tpslSchema],
  stopLosses: [tpslSchema],
  protectionSL: {
    type: Boolean,
    default: false
  },
  protectionOrderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// 复合索引
configSchema.index({ user: 1, createdAt: -1 });
configSchema.index({ user: 1, symbol: 1 });

// 虚拟属性：开仓数量
configSchema.virtual('entryCount').get(function() {
  return this.entries ? this.entries.filter(e => e.enabled).length : 0;
});

// 虚拟属性：止盈数量
configSchema.virtual('tpCount').get(function() {
  return this.takeProfits ? this.takeProfits.filter(tp => tp.enabled).length : 0;
});

// 虚拟属性：止损数量
configSchema.virtual('slCount').get(function() {
  return this.stopLosses ? this.stopLosses.filter(sl => sl.enabled).length : 0;
});

// 虚拟属性：总仓位大小
configSchema.virtual('totalPositionSize').get(function() {
  if (this.entries && this.entries.length > 0) {
    return this.entries
      .filter(e => e.enabled)
      .reduce((sum, e) => sum + parseFloat(e.positionSize || 0), 0);
  }
  return this.positionSize || 0;
});

module.exports = mongoose.model('Config', configSchema);
