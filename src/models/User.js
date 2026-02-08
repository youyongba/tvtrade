const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, '用户名不能为空'],
    unique: true,
    trim: true,
    minlength: [2, '用户名至少2个字符'],
    maxlength: [30, '用户名最多30个字符']
  },
  email: { 
    type: String, 
    required: [true, '邮箱不能为空'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, '邮箱格式不正确']
  },
  password: { 
    type: String, 
    required: [true, '密码不能为空'],
    minlength: [6, '密码至少6个字符'],
    select: false
  },
  webhookToken: {
    type: String,
    unique: true,
    default: () => 'wh_' + crypto.randomBytes(16).toString('hex')
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // 密码重置相关字段
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 密码加密
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// 验证密码
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 生成新的 webhook token
userSchema.methods.regenerateWebhookToken = function() {
  this.webhookToken = 'wh_' + crypto.randomBytes(16).toString('hex');
  return this.webhookToken;
};

// 生成密码重置 token
userSchema.methods.createPasswordResetToken = function() {
  // 生成随机 token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // 哈希存储到数据库
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // 设置过期时间 (10分钟)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  
  // 返回未哈希的 token (用于发送给用户)
  return resetToken;
};

// 清除密码重置 token
userSchema.methods.clearPasswordResetToken = function() {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpire = undefined;
};

module.exports = mongoose.model('User', userSchema);
