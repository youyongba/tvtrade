const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * 保护路由 - 验证 JWT Token
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // 从 Header 获取 token
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // 检查 token 是否存在
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '请先登录'
        }
      });
    }

    try {
      // 验证 token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 检查用户是否存在
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '用户不存在'
          }
        });
      }

      // 检查用户是否激活
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '账号已被禁用'
          }
        });
      }

      // 将用户信息添加到请求对象
      req.user = user;
      next();

    } catch (err) {
      // Token 过期或无效
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token 已过期或无效，请重新登录'
        }
      });
    }

  } catch (error) {
    console.error('Auth middleware error:', error);
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
 * 可选认证 - 有 token 则解析，无 token 也放行
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (err) {
        // Token 无效，忽略
      }
    }

    next();
  } catch (error) {
    next();
  }
};
