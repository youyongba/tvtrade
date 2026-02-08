const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Webhook } = require('../models');
const { sendPasswordResetEmail } = require('../utils/sendEmail');

// 生成 JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// 发送 Token 响应
const sendTokenResponse = (user, statusCode, res, includeWebhook = false) => {
  const token = signToken(user._id);

  const responseData = {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    },
    token
  };

  if (includeWebhook) {
    responseData.webhook = {
      url: `${process.env.WEBHOOK_BASE_URL || 'https://tvtrade.io'}/webhook/${user.webhookToken}`,
      token: user.webhookToken
    };
  }

  res.status(statusCode).json({
    success: true,
    data: responseData
  });
};

/**
 * @desc    用户注册
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    console.log('Register attempt:', { username, email });

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写用户名、邮箱和密码'
        }
      });
    }

    // 检查邮箱是否已存在
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: '该邮箱已被注册'
        }
      });
    }

    // 检查用户名是否已存在
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: '该用户名已被使用'
        }
      });
    }

    console.log('Creating user...');
    // 创建用户
    const user = await User.create({
      username,
      email,
      password
    });
    console.log('User created:', user._id, 'webhookToken:', user.webhookToken);

    // 创建 Webhook 记录
    console.log('Creating webhook...');
    await Webhook.create({
      user: user._id,
      token: user.webhookToken
    });
    console.log('Webhook created');

    // 发送响应
    sendTokenResponse(user, 201, res, true);

  } catch (error) {
    // 详细错误日志
    console.error('Register error:', error.message);
    console.error('Error stack:', error.stack);

    // 处理 Mongoose 验证错误
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messages.join(', ')
        }
      });
    }

    // 处理重复键错误
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldNames = { email: '邮箱', username: '用户名', webhookToken: 'Webhook Token' };
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: `${fieldNames[field] || field} 已被使用`
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    用户登录
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 验证必填字段
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写邮箱和密码'
        }
      });
    }

    // 查找用户（包含密码字段）
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '邮箱或密码错误'
        }
      });
    }

    // 检查账号是否激活
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '账号已被禁用'
        }
      });
    }

    // 验证密码
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '邮箱或密码错误'
        }
      });
    }

    // 发送响应
    sendTokenResponse(user, 200, res);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    获取当前用户信息
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '用户不存在'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    退出登录
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = async (req, res, next) => {
  // JWT 是无状态的，客户端删除 token 即可
  // 如需服务端注销，可实现 token 黑名单机制
  res.status(200).json({
    success: true,
    message: '已退出登录'
  });
};

/**
 * @desc    请求密码重置（发送重置邮件/获取重置token）
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写邮箱地址'
        }
      });
    }

    // 查找用户
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '该邮箱未注册'
        }
      });
    }

    // 检查账号是否激活
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '账号已被禁用'
        }
      });
    }

    // 生成重置 token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // 生成重置 URL
    const resetUrl = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/reset-password/${resetToken}`;

    try {
      // 发送重置邮件
      await sendPasswordResetEmail(user.email, resetUrl, user.username);
      console.log('Password reset email sent to:', user.email);

      res.status(200).json({
        success: true,
        message: '密码重置链接已发送到您的邮箱，请查收'
      });

    } catch (emailError) {
      // 邮件发送失败，清除重置 token
      console.error('Email send error:', emailError);
      user.clearPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_ERROR',
          message: '邮件发送失败，请稍后重试'
        }
      });
    }

  } catch (error) {
    console.error('ForgotPassword error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误，请稍后重试'
      }
    });
  }
};

/**
 * @desc    验证重置 Token 是否有效
 * @route   GET /api/auth/reset-password/:token
 * @access  Public
 */
exports.validateResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    // 哈希 token 进行比对
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // 查找有效的重置 token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: '重置链接无效或已过期'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token 有效',
      data: {
        email: user.email
      }
    });

  } catch (error) {
    console.error('ValidateResetToken error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};

/**
 * @desc    重置密码
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // 验证密码
    if (!password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '请填写新密码'
        }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '密码至少需要6个字符'
        }
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: '两次输入的密码不一致'
        }
      });
    }

    // 哈希 token 进行比对
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // 查找有效的重置 token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: '重置链接无效或已过期'
        }
      });
    }

    // 更新密码
    user.password = password;
    user.clearPasswordResetToken();
    await user.save();

    // 返回新的登录 token
    sendTokenResponse(user, 200, res);

  } catch (error) {
    console.error('ResetPassword error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};
