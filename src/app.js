require('dotenv').config();

// 配置全局代理
const proxyUrl = process.env.PROXY_URL || process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { setGlobalDispatcher, ProxyAgent } = require('undici');
  const proxyAgent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(proxyAgent);
  console.log('Global proxy enabled:', proxyUrl);
}

const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Routes
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhook');
const exchangeRoutes = require('./routes/exchange');
const configRoutes = require('./routes/config');
const positionRoutes = require('./routes/position');
const activityRoutes = require('./routes/activity');

const app = express();

connectDB();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/activities', activityRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 公开 Webhook 接收接口 (TradingView 调用)
const webhookController = require('./controllers/webhookController');
app.post('/webhook/:token', webhookController.receiveWebhook);

// Page routes
app.get('/', (req, res) => {
    res.render('index', { title: 'TVTrade' });
});

// 密码重置页面
app.get('/reset-password/:token', (req, res) => {
    res.render('reset-password', { token: req.params.token });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
