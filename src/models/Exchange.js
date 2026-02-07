const mongoose = require('mongoose');
const crypto = require('crypto');

// 加密配置
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

const exchangeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  exchange: {
    type: String,
    required: [true, '交易所不能为空'],
    enum: {
      values: ['binance', 'okx', 'bybit', 'bitget'],
      message: '不支持的交易所: {VALUE}'
    }
  },
  apiKey: {
    type: String,
    required: [true, 'API Key 不能为空']
  },
  apiSecret: {
    type: String,
    required: [true, 'API Secret 不能为空'],
    select: false
  },
  passphrase: {
    type: String,
    default: '',
    select: false
  },
  connected: {
    type: Boolean,
    default: false
  },
  balance: {
    type: Number,
    default: 0
  },
  permissions: [{
    type: String,
    enum: ['spot', 'futures', 'margin']
  }],
  lastConnectedAt: Date
}, { 
  timestamps: true 
});

// 复合索引：每个用户每个交易所只能有一个配置
exchangeSchema.index({ user: 1, exchange: 1 }, { unique: true });

// 保存前加密敏感数据
exchangeSchema.pre('save', function(next) {
  if (this.isModified('apiSecret')) {
    this.apiSecret = encrypt(this.apiSecret);
  }
  if (this.isModified('passphrase') && this.passphrase) {
    this.passphrase = encrypt(this.passphrase);
  }
  next();
});

// 解密方法
exchangeSchema.methods.getDecryptedSecret = function() {
  return decrypt(this.apiSecret);
};

exchangeSchema.methods.getDecryptedPassphrase = function() {
  return this.passphrase ? decrypt(this.passphrase) : '';
};

// 脱敏 API Key
exchangeSchema.methods.getMaskedApiKey = function() {
  if (!this.apiKey) return '';
  const key = this.apiKey;
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
};

module.exports = mongoose.model('Exchange', exchangeSchema);
