const { User, Webhook } = require('../models');

/**
 * @desc    获取当前用户的 Webhook 配置
 * @route   GET /api/webhook
 * @access  Private
 */
exports.getWebhook = async (req, res) => {
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

    const baseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(200).json({
      success: true,
      data: {
        url: `${baseUrl}/webhook/${user.webhookToken}`,
        token: user.webhookToken,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('GetWebhook error:', error);
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
 * @desc    重新生成 Webhook Token
 * @route   POST /api/webhook/regenerate
 * @access  Private
 */
exports.regenerateWebhook = async (req, res) => {
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

    // 重新生成 webhook token
    const newToken = user.regenerateWebhookToken();
    await user.save();

    // 更新 Webhook 记录
    await Webhook.findOneAndUpdate(
      { user: user._id },
      { token: newToken },
      { upsert: true }
    );

    const baseUrl = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(200).json({
      success: true,
      data: {
        url: `${baseUrl}/webhook/${newToken}`,
        token: newToken
      },
      message: '已生成新的 Webhook URL'
    });

  } catch (error) {
    console.error('RegenerateWebhook error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    });
  }
};
