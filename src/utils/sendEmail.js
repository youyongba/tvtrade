const nodemailer = require('nodemailer');

// 创建邮件传输器
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * 发送邮件
 * @param {Object} options - 邮件选项
 * @param {string} options.to - 收件人邮箱
 * @param {string} options.subject - 邮件主题
 * @param {string} options.text - 纯文本内容
 * @param {string} options.html - HTML内容
 */
const sendEmail = async (options) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent:', info.messageId);
  return info;
};

/**
 * 发送密码重置邮件
 * @param {string} email - 用户邮箱
 * @param {string} resetUrl - 重置链接
 * @param {string} username - 用户名
 */
const sendPasswordResetEmail = async (email, resetUrl, username) => {
  const subject = '【TVTrade】密码重置';
  
  const text = `
您好 ${username}，

您正在请求重置 TVTrade 账户密码。

请点击以下链接重置密码（链接10分钟内有效）：
${resetUrl}

如果您没有请求重置密码，请忽略此邮件。

TVTrade 团队
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .button:hover { opacity: 0.9; }
    .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-top: 20px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 TVTrade 密码重置</h1>
    </div>
    <div class="content">
      <p>您好 <strong>${username}</strong>，</p>
      <p>您正在请求重置 TVTrade 账户密码。请点击下方按钮设置新密码：</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="button">重置密码</a>
      </div>
      
      <p style="color: #666; font-size: 13px;">如果按钮无法点击，请复制以下链接到浏览器：</p>
      <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px; font-size: 12px;">${resetUrl}</p>
      
      <div class="warning">
        ⚠️ 此链接将在 <strong>10分钟</strong> 后失效。如果您没有请求重置密码，请忽略此邮件。
      </div>
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复。</p>
      <p>© 2026 TVTrade. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail
};
