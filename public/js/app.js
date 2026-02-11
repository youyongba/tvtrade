// ==================== 用户和API配置 ====================

// API 基础路径
const API_BASE = '/api';

// 用户数据
let currentUser = JSON.parse(localStorage.getItem('tvtrade_user') || 'null');
let authToken = localStorage.getItem('tvtrade_token') || null;
let exchangeConfig = JSON.parse(localStorage.getItem('tvtrade_exchange') || 'null');
let webhookConfig = JSON.parse(localStorage.getItem('tvtrade_webhook') || 'null');

// API 请求工具函数
async function apiRequest(endpoint, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    // 添加认证头
    if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || '请求失败');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// 弹窗控制
function openModal(modalId) {
    // 打开登录弹窗时，重置到登录表单
    if (modalId === 'loginModal') {
        resetAuthModal();
    }
    // 打开交易所弹窗时，更新 UI
    if (modalId === 'exchangeModal') {
        updateExchangeModalUI();
    }
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    
    // 关闭登录弹窗时，重置到登录表单
    if (modalId === 'loginModal') {
        resetAuthModal();
    }
}

// 重置登录弹窗到初始状态
function resetAuthModal() {
    // 重置到登录表单
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');
    const authTabs = document.getElementById('authTabs');
    const authModalTitle = document.getElementById('authModalTitle');
    
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (resetForm) resetForm.style.display = 'none';
    if (authTabs) authTabs.style.display = 'flex';
    if (authModalTitle) authModalTitle.textContent = '🔐 用户登录';
    
    // 重置标签状态
    document.querySelectorAll('.modal-tab').forEach((t, i) => {
        t.classList.toggle('active', i === 0);
    });
    
    // 清空表单输入
    const inputs = ['loginEmail', 'loginPassword', 'regUsername', 'regEmail', 'regPassword', 'regConfirmPassword', 'forgotEmail', 'resetPassword', 'resetConfirmPassword'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // 恢复找回密码表单（如果被修改过）
    restoreForgotForm();
    
    // 恢复重置密码表单
    if (resetForm) {
        resetForm.innerHTML = `
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                请设置您的新密码。
            </p>
            <div class="form-group">
                <label class="form-label">新密码</label>
                <input type="password" class="form-input" id="resetPassword" placeholder="请输入新密码 (至少6位)">
            </div>
            <div class="form-group">
                <label class="form-label">确认新密码</label>
                <input type="password" class="form-input" id="resetConfirmPassword" placeholder="请再次输入新密码">
            </div>
            <button class="btn-primary" style="width: 100%; margin-top: 1rem;" onclick="handleResetPassword()">重置密码</button>
        `;
    }
    
    // 清除重置 token
    resetPasswordToken = null;
}

// 点击弹窗外部关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            // 如果是登录弹窗，重置到初始状态
            if (this.id === 'loginModal') {
                resetAuthModal();
            }
        }
    });
});

// 密码重置 token（用于重置密码流程）
let resetPasswordToken = null;

// 切换登录/注册/找回密码标签
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');
    const authTabs = document.getElementById('authTabs');
    const authModalTitle = document.getElementById('authModalTitle');
    
    // 隐藏所有表单
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    forgotForm.style.display = 'none';
    resetForm.style.display = 'none';
    
    // 重置标签状态
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    
    switch(tab) {
        case 'login':
            loginForm.style.display = 'block';
            authTabs.style.display = 'flex';
            authModalTitle.textContent = '🔐 用户登录';
            document.querySelector('.modal-tab:first-child').classList.add('active');
            break;
        case 'register':
            registerForm.style.display = 'block';
            authTabs.style.display = 'flex';
            authModalTitle.textContent = '🔐 用户注册';
            document.querySelector('.modal-tab:last-child').classList.add('active');
            break;
        case 'forgot':
            forgotForm.style.display = 'block';
            authTabs.style.display = 'none';
            authModalTitle.textContent = '🔑 找回密码';
            break;
        case 'reset':
            resetForm.style.display = 'block';
            authTabs.style.display = 'none';
            authModalTitle.textContent = '🔑 重置密码';
            break;
    }
}

// 登录处理
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast('请填写邮箱和密码', 'error');
        return;
    }

    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        // 保存用户数据和token
        currentUser = result.data.user;
        authToken = result.data.token;
        
        localStorage.setItem('tvtrade_user', JSON.stringify(currentUser));
        localStorage.setItem('tvtrade_token', authToken);

        // 获取用户配置
        await loadUserWebhook();
        await loadExchangeConfig();

        updateUIState();
        closeModal('loginModal');
        showToast(`欢迎回来, ${currentUser.username}!`, 'success');
        
        // 清空表单
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';

    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    }
}

// 注册处理
async function handleRegister() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!username || !email || !password) {
        showToast('请填写所有必填项', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('两次输入的密码不一致', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('密码至少需要6位', 'error');
        return;
    }

    try {
        const result = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });

        // 保存用户数据和token
        currentUser = result.data.user;
        authToken = result.data.token;
        
        localStorage.setItem('tvtrade_user', JSON.stringify(currentUser));
        localStorage.setItem('tvtrade_token', authToken);

        // 保存webhook配置
        if (result.data.webhook) {
            webhookConfig = {
                url: result.data.webhook.url,
                token: result.data.webhook.token,
                createdAt: new Date().toISOString()
            };
            localStorage.setItem('tvtrade_webhook', JSON.stringify(webhookConfig));
        }

        updateUIState();
        closeModal('loginModal');
        showToast('注册成功，欢迎使用 TVTrade!', 'success');
        
        // 清空表单
        document.getElementById('regUsername').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regConfirmPassword').value = '';

    } catch (error) {
        showToast(error.message || '注册失败', 'error');
    }
}

// 加载用户Webhook信息
async function loadUserWebhook() {
    try {
        const result = await apiRequest('/webhook');
        if (result.success && result.data) {
            webhookConfig = {
                url: result.data.url,
                token: result.data.token,
                createdAt: result.data.createdAt
            };
            localStorage.setItem('tvtrade_webhook', JSON.stringify(webhookConfig));
        }
    } catch (error) {
        console.error('加载Webhook失败:', error);
    }
}

// 退出登录
async function handleLogout() {
    try {
        // 调用服务端退出登录
        if (authToken) {
            await apiRequest('/auth/logout', { method: 'POST' });
        }
    } catch (error) {
        // 即使服务端退出失败，也清除本地数据
        console.error('Logout error:', error);
    }

    // 清除所有本地数据（用户、Token、交易所配置、Webhook配置）
    currentUser = null;
    authToken = null;
    exchangeConfig = null;
    webhookConfig = null;
    
    localStorage.removeItem('tvtrade_user');
    localStorage.removeItem('tvtrade_token');
    localStorage.removeItem('tvtrade_exchange');
    localStorage.removeItem('tvtrade_webhook');
    
    updateUIState();
    showToast('已退出登录', 'success');
}

// 找回密码处理
async function handleForgotPassword() {
    const emailInput = document.getElementById('forgotEmail');
    const email = emailInput ? emailInput.value : '';

    if (!email) {
        showToast('请填写邮箱地址', 'error');
        return;
    }

    // 验证邮箱格式
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
        showToast('请输入有效的邮箱地址', 'error');
        return;
    }

    try {
        showToast('正在发送...', 'success');
        
        const result = await apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        // 显示邮件已发送的消息
        showEmailSentMessage(email);
        showToast('重置链接已发送到您的邮箱', 'success');

    } catch (error) {
        showToast(error.message || '发送失败，请稍后重试', 'error');
    }
}

// 显示邮件已发送消息
function showEmailSentMessage(email) {
    const forgotForm = document.getElementById('forgotForm');
    forgotForm.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📧</div>
            <p style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.1rem;">邮件已发送!</p>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
                密码重置链接已发送到<br><strong style="color: var(--accent-cyan);">${email}</strong>
            </p>
            <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align: left;">
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.5rem;">📌 提示：</p>
                <ul style="color: var(--text-muted); font-size: 0.8rem; margin: 0; padding-left: 1.2rem;">
                    <li>请检查您的邮箱收件箱</li>
                    <li>如未收到，请检查垃圾邮件</li>
                    <li>链接有效期为 10 分钟</li>
                </ul>
            </div>
            <button class="btn-primary" style="width: 100%; margin-bottom: 1rem;" onclick="restoreForgotForm();">
                重新发送
            </button>
            <a href="#" onclick="restoreForgotForm(); switchAuthTab('login'); return false;" 
               style="color: var(--text-muted); font-size: 0.875rem; text-decoration: none;">
                ← 返回登录
            </a>
        </div>
    `;
}

// 恢复找回密码表单
function restoreForgotForm() {
    const forgotForm = document.getElementById('forgotForm');
    forgotForm.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
            请输入您的注册邮箱，我们将发送密码重置链接。
        </p>
        <div class="form-group">
            <label class="form-label">邮箱</label>
            <input type="email" class="form-input" id="forgotEmail" placeholder="请输入注册邮箱">
        </div>
        <button class="btn-primary" style="width: 100%; margin-top: 1rem;" onclick="handleForgotPassword()">发送重置链接</button>
        <div style="text-align: center; margin-top: 1rem;">
            <a href="#" onclick="switchAuthTab('login'); return false;" style="color: var(--accent-cyan); font-size: 0.875rem; text-decoration: none;">← 返回登录</a>
        </div>
    `;
}


// 重置密码处理
async function handleResetPassword() {
    const password = document.getElementById('resetPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    if (!password) {
        showToast('请填写新密码', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('密码至少需要6个字符', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('两次输入的密码不一致', 'error');
        return;
    }

    if (!resetPasswordToken) {
        showToast('重置链接无效，请重新申请', 'error');
        switchAuthTab('forgot');
        return;
    }

    try {
        const result = await apiRequest(`/auth/reset-password/${resetPasswordToken}`, {
            method: 'POST',
            body: JSON.stringify({ password, confirmPassword })
        });

        // 重置成功，自动登录
        currentUser = result.data.user;
        authToken = result.data.token;
        
        localStorage.setItem('tvtrade_user', JSON.stringify(currentUser));
        localStorage.setItem('tvtrade_token', authToken);

        // 清除重置 token
        resetPasswordToken = null;
        
        // 清空表单
        document.getElementById('resetPassword').value = '';
        document.getElementById('resetConfirmPassword').value = '';

        await loadUserWebhook();
        updateUIState();
        closeModal('loginModal');
        showToast('密码重置成功！', 'success');

    } catch (error) {
        showToast(error.message || '重置失败，请稍后重试', 'error');
    }
}

// 验证并刷新用户状态
async function validateSession() {
    if (!authToken) return;
    
    try {
        const result = await apiRequest('/auth/me');
        if (result.success) {
            currentUser = result.data;
            localStorage.setItem('tvtrade_user', JSON.stringify(currentUser));
        }
    } catch (error) {
        // Token无效，清除登录状态
        console.error('Session validation failed:', error);
        currentUser = null;
        authToken = null;
        localStorage.removeItem('tvtrade_user');
        localStorage.removeItem('tvtrade_token');
        updateUIState();
    }
}

// 生成随机ID
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 密码可见性切换
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

// 保存交易所配置
async function saveExchangeConfig() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }

    const exchange = document.getElementById('exchangeSelect').value;
    const apiKey = document.getElementById('apiKey').value;
    const apiSecret = document.getElementById('apiSecret').value;
    const passphrase = document.getElementById('apiPassphrase').value;

    if (!apiKey || !apiSecret) {
        showToast('请填写 API Key 和 Secret', 'error');
        return;
    }

    try {
        showToast('正在保存并测试连接...', 'success');

        const result = await apiRequest('/exchanges', {
            method: 'POST',
            body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase })
        });

        // 更新本地状态
        exchangeConfig = {
            id: result.data.id,
            exchange: result.data.exchange,
            apiKey: result.data.apiKey,
            connected: result.data.connected,
            balance: result.data.balance || 0,
            permissions: result.data.permissions || [],
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('tvtrade_exchange', JSON.stringify(exchangeConfig));

        updateUIState();
        closeModal('exchangeModal');
        
        if (result.data.connected) {
            showToast(`配置已保存并连接成功! 余额: $${result.data.balance.toLocaleString()}`, 'success');
        } else {
            showToast('配置已保存，但连接测试失败，请检查 API 配置', 'error');
        }

    } catch (error) {
        showToast(error.message || '保存失败', 'error');
    }
}

// 测试API连接
async function testApiConnection() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }

    const exchange = document.getElementById('exchangeSelect').value;
    const apiKey = document.getElementById('apiKey').value;
    const apiSecret = document.getElementById('apiSecret').value;
    const passphrase = document.getElementById('apiPassphrase').value;

    if (!apiKey || !apiSecret) {
        showToast('请先填写 API Key 和 Secret', 'error');
        return;
    }

    try {
        showToast('正在测试连接...', 'success');

        const result = await apiRequest('/exchanges/test', {
            method: 'POST',
            body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase })
        });

        if (result.success && result.data.connected) {
            // 更新本地状态（保留当前表单的值，不覆盖）
            exchangeConfig = {
                id: exchangeConfig?.id,
                exchange: exchange,
                apiKey: apiKey, // 保留完整的 apiKey 用于表单显示
                connected: true,
                balance: result.data.balance,
                permissions: result.data.permissions
            };
            localStorage.setItem('tvtrade_exchange', JSON.stringify(exchangeConfig));

            // 更新弹窗中的连接状态显示
            const connectionStatus = document.getElementById('exchangeConnectionStatus');
            const statusDot = document.getElementById('exchangeStatusDot');
            const statusText = document.getElementById('exchangeStatusText');
            const balanceText = document.getElementById('exchangeBalanceText');
            
            const exchangeNames = {
                'binance': 'Binance Futures',
                'okx': 'OKX',
                'bybit': 'Bybit',
                'bitget': 'Bitget'
            };
            
            connectionStatus.style.display = 'block';
            statusDot.style.background = 'var(--success)';
            statusText.textContent = `${exchangeNames[exchange]} 已连接`;
            balanceText.textContent = `$${result.data.balance.toLocaleString()}`;

            updateUIState();
            showToast(`连接成功! 余额: $${result.data.balance.toLocaleString()}`, 'success');
        }

    } catch (error) {
        showToast(error.message || 'API 连接测试失败', 'error');
    }
}

// 加载交易所配置
async function loadExchangeConfig() {
    if (!authToken) return;

    try {
        const result = await apiRequest('/exchanges');
        
        if (result.success && result.data) {
            exchangeConfig = {
                id: result.data.id,
                exchange: result.data.exchange,
                apiKey: result.data.apiKey,
                connected: result.data.connected,
                balance: result.data.balance || 0,
                permissions: result.data.permissions
            };
            localStorage.setItem('tvtrade_exchange', JSON.stringify(exchangeConfig));
            updateUIState();
        }
    } catch (error) {
        console.error('加载交易所配置失败:', error);
    }
}

// 刷新交易所余额（实时查询）
async function refreshBalance() {
    if (!authToken) {
        showToast('请先登录', 'error');
        return;
    }

    if (!exchangeConfig || !exchangeConfig.id) {
        showToast('请先配置交易所 API', 'error');
        return;
    }

    const refreshBtn = document.getElementById('refreshBalanceBtn');
    const balanceDisplay = document.getElementById('balanceDisplay');
    
    // 显示加载状态
    if (refreshBtn) {
        refreshBtn.style.animation = 'spin 1s linear infinite';
        refreshBtn.disabled = true;
    }
    balanceDisplay.textContent = '余额: 刷新中...';
    balanceDisplay.style.color = 'var(--text-muted)';

    try {
        const result = await apiRequest('/exchanges/refresh-balance', {
            method: 'POST'
        });

        if (result.success) {
            // 更新本地状态
            exchangeConfig.connected = result.data.connected;
            exchangeConfig.balance = result.data.balance;
            exchangeConfig.permissions = result.data.permissions;
            localStorage.setItem('tvtrade_exchange', JSON.stringify(exchangeConfig));

            balanceDisplay.textContent = `余额: $${result.data.balance.toLocaleString()}`;
            balanceDisplay.style.color = 'var(--accent-gold)';
            showToast(`余额已刷新: $${result.data.balance.toLocaleString()}`, 'success');
        } else {
            balanceDisplay.textContent = '余额: 刷新失败';
            balanceDisplay.style.color = 'var(--danger)';
            showToast(result.error?.message || '刷新余额失败', 'error');
        }

    } catch (error) {
        balanceDisplay.textContent = '余额: 刷新失败';
        balanceDisplay.style.color = 'var(--danger)';
        showToast(error.message || '刷新余额失败', 'error');
    } finally {
        // 恢复按钮状态
        if (refreshBtn) {
            refreshBtn.style.animation = '';
            refreshBtn.disabled = false;
        }
    }
}

// 删除交易所配置
async function deleteExchangeConfig() {
    if (!exchangeConfig || !exchangeConfig.id) {
        showToast('没有可删除的配置', 'error');
        return;
    }

    if (!confirm('确定要删除交易所配置吗？')) {
        return;
    }

    try {
        await apiRequest(`/exchanges/${exchangeConfig.id}`, {
            method: 'DELETE'
        });

        exchangeConfig = null;
        localStorage.removeItem('tvtrade_exchange');
        
        // 清空表单
        document.getElementById('apiKey').value = '';
        document.getElementById('apiSecret').value = '';
        document.getElementById('apiPassphrase').value = '';

        updateExchangeModalUI();
        updateUIState();
        showToast('交易所配置已删除', 'success');

    } catch (error) {
        showToast(error.message || '删除失败', 'error');
    }
}

// 交易所列表（需要 passphrase 的交易所）
const EXCHANGES_REQUIRING_PASSPHRASE = ['okx', 'bitget'];

// 交易所选择变化时
function onExchangeChange() {
    const exchange = document.getElementById('exchangeSelect').value;
    const passphraseRequired = document.getElementById('passphraseRequired');
    const passphraseInput = document.getElementById('apiPassphrase');
    
    if (EXCHANGES_REQUIRING_PASSPHRASE.includes(exchange)) {
        passphraseRequired.style.display = 'inline';
        passphraseInput.placeholder = '必填，请输入 Passphrase';
    } else {
        passphraseRequired.style.display = 'none';
        passphraseInput.placeholder = '可选';
    }
}

// 更新交易所弹窗 UI
function updateExchangeModalUI() {
    const connectionStatus = document.getElementById('exchangeConnectionStatus');
    const statusDot = document.getElementById('exchangeStatusDot');
    const statusText = document.getElementById('exchangeStatusText');
    const balanceText = document.getElementById('exchangeBalanceText');
    const deleteBtn = document.getElementById('deleteExchangeBtn');
    
    // 清空敏感输入框（apiSecret 和 passphrase 不存储，每次打开都需要重新输入）
    const apiSecretInput = document.getElementById('apiSecret');
    const apiPassphraseInput = document.getElementById('apiPassphrase');
    if (apiSecretInput) apiSecretInput.value = '';
    if (apiPassphraseInput) apiPassphraseInput.value = '';
    
    if (exchangeConfig && exchangeConfig.connected) {
        const exchangeNames = {
            'binance': 'Binance Futures',
            'okx': 'OKX',
            'bybit': 'Bybit',
            'bitget': 'Bitget'
        };
        
        connectionStatus.style.display = 'block';
        statusDot.style.background = 'var(--success)';
        statusText.textContent = `${exchangeNames[exchangeConfig.exchange] || exchangeConfig.exchange} 已连接`;
        balanceText.textContent = exchangeConfig.balance ? `$${exchangeConfig.balance.toLocaleString()}` : '';
        deleteBtn.style.display = 'block';
        
        // 填充表单 - 只填充交易所类型和脱敏后的 API Key
        document.getElementById('exchangeSelect').value = exchangeConfig.exchange;
        document.getElementById('apiKey').value = exchangeConfig.apiKey || '';
    } else if (exchangeConfig && exchangeConfig.id) {
        connectionStatus.style.display = 'block';
        statusDot.style.background = 'var(--text-muted)';
        statusText.textContent = '未测试连接';
        balanceText.textContent = '';
        deleteBtn.style.display = 'block';
        
        document.getElementById('exchangeSelect').value = exchangeConfig.exchange;
        document.getElementById('apiKey').value = exchangeConfig.apiKey || '';
    } else {
        connectionStatus.style.display = 'none';
        deleteBtn.style.display = 'none';
        // 无配置时清空所有字段
        document.getElementById('apiKey').value = '';
    }
    
    // 触发交易所选择变化
    onExchangeChange();
}

// 复制Webhook URL
function copyMyWebhookUrl() {
    if (!webhookConfig) {
        showToast('请先登录生成 Webhook URL', 'error');
        return;
    }
    navigator.clipboard.writeText(webhookConfig.url);
    showToast('Webhook URL 已复制', 'success');
}

// 重新生成Webhook
async function regenerateWebhook() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    
    try {
        const result = await apiRequest('/webhook/regenerate', {
            method: 'POST'
        });
        
        if (result.success && result.data) {
            webhookConfig = {
                url: result.data.url,
                token: result.data.token,
                createdAt: new Date().toISOString()
            };
            localStorage.setItem('tvtrade_webhook', JSON.stringify(webhookConfig));
            updateUIState();
            updateAllWebhooks();
            showToast('已生成新的 Webhook URL', 'success');
        }
    } catch (error) {
        showToast(error.message || '重新生成失败', 'error');
    }
}

// 更新界面状态
function updateUIState() {
    const userBtn = document.getElementById('userBtn');
    const userDisplay = document.getElementById('userDisplay');
    const webhookStatus = document.getElementById('webhookStatus');
    const webhookDot = document.getElementById('webhookDot');
    const exchangeStatus = document.getElementById('exchangeStatus');
    const balanceDisplay = document.getElementById('balanceDisplay');
    const myWebhookUrl = document.getElementById('myWebhookUrl');
    const webhookUrlInput = document.getElementById('webhookUrl');
    const webhookIndicator = document.getElementById('webhookIndicator');
    const webhookConnectionText = document.getElementById('webhookConnectionText');

    // 用户状态
    if (currentUser) {
        userDisplay.textContent = currentUser.username;
        userBtn.classList.add('logged-in');
        userBtn.onclick = handleLogout;
    } else {
        userDisplay.textContent = '登录';
        userBtn.classList.remove('logged-in');
        userBtn.onclick = () => openModal('loginModal');
    }

    // Webhook状态
    if (webhookConfig) {
        webhookStatus.textContent = 'Webhook 已配置';
        webhookDot.style.background = 'var(--success)';
        myWebhookUrl.textContent = webhookConfig.url;
        if (webhookUrlInput) webhookUrlInput.value = webhookConfig.url;
        webhookIndicator.classList.add('connected');
        webhookIndicator.classList.remove('disconnected');
        webhookConnectionText.textContent = '连接正常';
    } else {
        webhookStatus.textContent = 'Webhook 未配置';
        webhookDot.style.background = 'var(--text-muted)';
        myWebhookUrl.textContent = '请先登录生成 Webhook URL';
        webhookIndicator.classList.remove('connected');
        webhookIndicator.classList.add('disconnected');
        webhookConnectionText.textContent = '等待登录...';
    }

    // 交易所状态
    if (exchangeConfig && exchangeConfig.connected) {
        const exchangeNames = {
            'binance': 'Binance Futures',
            'okx': 'OKX',
            'bybit': 'Bybit',
            'bitget': 'Bitget'
        };
        exchangeStatus.textContent = `交易所: ${exchangeNames[exchangeConfig.exchange] || exchangeConfig.exchange}`;
        balanceDisplay.textContent = `余额: $${exchangeConfig.balance.toLocaleString()}`;
        balanceDisplay.style.color = 'var(--accent-gold)';
        
        document.getElementById('exchangeSelect').value = exchangeConfig.exchange;
        // 只填充 apiKey（脱敏后的），不覆盖 apiSecret 和 passphrase（敏感信息不保存）
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput && !apiKeyInput.value) {
            apiKeyInput.value = exchangeConfig.apiKey || '';
        }
    } else {
        exchangeStatus.textContent = '交易所: 未连接';
        balanceDisplay.textContent = '余额: --';
        balanceDisplay.style.color = 'var(--text-muted)';
    }
}

// Data stores
let takeProfits = [
    { id: 1, closePercent: '50', orderType: 'market', enabled: true },
    { id: 2, closePercent: '30', orderType: 'market', enabled: true },
    { id: 3, closePercent: '20', orderType: 'market', enabled: true }
];

let stopLosses = [
    { id: 1, closePercent: '100', orderType: 'market', enabled: true }
];

let tpIdCounter = 4;
let slIdCounter = 2;

// 已保存的配置
let savedConfigs = JSON.parse(localStorage.getItem('tvtrade_configs') || '[]');
let configIdCounter = savedConfigs.length > 0 ? Math.max(...savedConfigs.map(c => c.id)) + 1 : 1;
let activeConfigId = null;

// 活动历史
let activities = JSON.parse(localStorage.getItem('tvtrade_activities') || '[]');

// 模拟持仓数据
let currentPosition = {
    symbol: 'BTCUSDT',
    direction: 'long',
    leverage: 20,
    entryPrice: 42150.50,
    currentPrice: 43285.20,
    quantity: 0.156,
    margin: 328.50
};

// Slider value display
document.querySelectorAll('.slider').forEach(slider => {
    const valueDisplay = slider.parentElement.querySelector('.slider-value');
    slider.addEventListener('input', function() {
        if (this.max === '125') {
            valueDisplay.textContent = this.value + 'x';
        } else {
            valueDisplay.textContent = this.value + '%';
        }
        updateAllWebhooks();
    });
});

// Toggle buttons
document.querySelectorAll('.toggle-group').forEach(group => {
    group.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateAllWebhooks();
        });
    });
});

// Symbol change
document.querySelector('select').addEventListener('change', updateAllWebhooks);

// Render Take Profits
function renderTakeProfits() {
    const container = document.getElementById('tpContainer');
    container.innerHTML = takeProfits.map((tp, index) => `
        <div class="tp-section active" data-tp-id="${tp.id}">
            <div class="tpsl-header-row">
                <div class="tpsl-header-left">
                    <input type="checkbox" class="tp-checkbox" ${tp.enabled ? 'checked' : ''} onchange="toggleTP(${tp.id})">
                    <span class="tp-label">🎯 止盈 ${index + 1}</span>
                </div>
                <div class="tpsl-header-right">
                    <div class="mini-toggle">
                        <button class="mini-toggle-btn ${tp.orderType === 'market' ? 'active' : ''}" onclick="setTPOrderType(${tp.id}, 'market')">市价</button>
                        <button class="mini-toggle-btn ${tp.orderType === 'limit' ? 'active' : ''}" onclick="setTPOrderType(${tp.id}, 'limit')">限价</button>
                    </div>
                    ${takeProfits.length > 1 ? `<button class="delete-btn" onclick="deleteTP(${tp.id})">×</button>` : ''}
                </div>
            </div>
            <div class="tpsl-simple-row">
                <div class="tp-input-group" style="flex: 1;">
                    <input type="text" class="form-input" value="${tp.closePercent}" placeholder="平仓比例" oninput="updateTPValue(${tp.id}, 'closePercent', this.value)">
                    <span class="tp-input-suffix">% 仓位</span>
                </div>
                <button class="copy-btn" onclick="copyTPWebhook(${tp.id})" style="height: 42px; min-width: 80px;">复制</button>
            </div>
            <div class="webhook-container" style="margin-top: 0.75rem;">
                <div class="webhook-code" id="tpWebhook_${tp.id}" style="max-height: 80px; font-size: 0.7rem;"></div>
            </div>
        </div>
    `).join('');
    updateAllWebhooks();
}

// Render Stop Losses
function renderStopLosses() {
    const container = document.getElementById('slContainer');
    container.innerHTML = stopLosses.map((sl, index) => `
        <div class="sl-section active" data-sl-id="${sl.id}">
            <div class="tpsl-header-row">
                <div class="tpsl-header-left">
                    <input type="checkbox" class="tp-checkbox" ${sl.enabled ? 'checked' : ''} onchange="toggleSL(${sl.id})">
                    <span class="sl-label">🛡️ 止损 ${stopLosses.length > 1 ? index + 1 : ''}</span>
                </div>
                <div class="tpsl-header-right">
                    <div class="mini-toggle">
                        <button class="mini-toggle-btn ${sl.orderType === 'market' ? 'active' : ''}" onclick="setSLOrderType(${sl.id}, 'market')">市价</button>
                        <button class="mini-toggle-btn ${sl.orderType === 'limit' ? 'active' : ''}" onclick="setSLOrderType(${sl.id}, 'limit')">限价</button>
                    </div>
                    ${stopLosses.length > 1 ? `<button class="delete-btn" onclick="deleteSL(${sl.id})">×</button>` : ''}
                </div>
            </div>
            <div class="tpsl-simple-row">
                <div class="tp-input-group" style="flex: 1;">
                    <input type="text" class="form-input" value="${sl.closePercent}" placeholder="平仓比例" oninput="updateSLValue(${sl.id}, 'closePercent', this.value)">
                    <span class="tp-input-suffix">% 仓位</span>
                </div>
                <button class="copy-btn" onclick="copySLWebhook(${sl.id})" style="height: 42px; min-width: 80px;">复制</button>
            </div>
            <div class="webhook-container" style="margin-top: 0.75rem;">
                <div class="webhook-code" id="slWebhook_${sl.id}" style="max-height: 80px; font-size: 0.7rem;"></div>
            </div>
        </div>
    `).join('');
    updateAllWebhooks();
}

function addTakeProfit() {
    takeProfits.push({ id: tpIdCounter++, closePercent: '100', orderType: 'market', enabled: true });
    renderTakeProfits();
}

function addStopLoss() {
    stopLosses.push({ id: slIdCounter++, closePercent: '100', orderType: 'market', enabled: true });
    renderStopLosses();
}

function deleteTP(id) { takeProfits = takeProfits.filter(tp => tp.id !== id); renderTakeProfits(); }
function deleteSL(id) { stopLosses = stopLosses.filter(sl => sl.id !== id); renderStopLosses(); }

function toggleTP(id) { const tp = takeProfits.find(t => t.id === id); if (tp) { tp.enabled = !tp.enabled; updateAllWebhooks(); } }
function toggleSL(id) { const sl = stopLosses.find(s => s.id === id); if (sl) { sl.enabled = !sl.enabled; updateAllWebhooks(); } }

function setTPOrderType(id, type) { const tp = takeProfits.find(t => t.id === id); if (tp) { tp.orderType = type; renderTakeProfits(); } }
function setSLOrderType(id, type) { const sl = stopLosses.find(s => s.id === id); if (sl) { sl.orderType = type; renderStopLosses(); } }

function setProtectionOrderType(type) {
    const btns = document.querySelectorAll('#protectionOrderType .mini-toggle-btn');
    btns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === type) btn.classList.add('active');
    });
    updateAllWebhooks();
}

function updateTPValue(id, field, value) { const tp = takeProfits.find(t => t.id === id); if (tp) { tp[field] = value; updateAllWebhooks(); } }
function updateSLValue(id, field, value) { const sl = stopLosses.find(s => s.id === id); if (sl) { sl[field] = value; updateAllWebhooks(); } }

function copyTPWebhook(id) { const code = document.getElementById(`tpWebhook_${id}`).textContent; copyToClipboard(code, document.querySelector(`[data-tp-id="${id}"] .copy-btn`)); }
function copySLWebhook(id) { const code = document.getElementById(`slWebhook_${id}`).textContent; copyToClipboard(code, document.querySelector(`[data-sl-id="${id}"] .copy-btn`)); }

function copyWebhook(elementId) {
    const code = document.getElementById(elementId).textContent;
    const container = document.getElementById(elementId).parentElement;
    const btn = container.querySelector('.copy-btn');
    copyToClipboard(code, btn);
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '已复制 ✓';
            btn.style.background = 'var(--success)';
            btn.style.borderColor = 'var(--success)';
            btn.style.color = 'white';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        }
    });
}

function copyAllWebhooks() {
    const settings = getSettings();
    let text = `=== 开仓警报 ===\n${document.getElementById('openWebhook').textContent}\n`;
    
    takeProfits.forEach((tp, index) => {
        if (tp.enabled) {
            text += `\n=== 止盈${index + 1}警报 (平${tp.closePercent}%仓) ===\n${document.getElementById(`tpWebhook_${tp.id}`).textContent}\n`;
        }
    });
    
    stopLosses.forEach((sl, index) => {
        if (sl.enabled) {
            text += `\n=== 止损${stopLosses.length > 1 ? index + 1 : ''}警报 (平${sl.closePercent}%仓) ===\n${document.getElementById(`slWebhook_${sl.id}`).textContent}\n`;
        }
    });
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('#summaryContainer').parentElement.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = '已复制全部 ✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
}

function getSettings() {
    const direction = document.querySelector('.toggle-btn.long.active') ? 'long' : 'short';
    const orderType = document.querySelectorAll('.toggle-group')[1].querySelector('.toggle-btn.active')?.textContent.includes('市价') ? 'market' : 'limit';
    const leverage = document.querySelector('input[max="125"]').value;
    const positionSize = document.querySelector('input[max="100"]').value;
    const symbol = document.querySelector('.left-panel select').value;
    return { direction, orderType, leverage, positionSize, symbol };
}

// 获取用户 token (从 webhook URL 中提取)
function getUserToken() {
    if (webhookConfig && webhookConfig.url) {
        const parts = webhookConfig.url.split('/');
        return parts[parts.length - 1];
    }
    return null;
}

function updateAllWebhooks() {
    const settings = getSettings();
    const userToken = getUserToken();
    
    const openWebhook = {
        token: userToken,
        action: `open_${settings.direction}`,
        symbol: settings.symbol,
        leverage: parseInt(settings.leverage),
        position_size: `${settings.positionSize}%`,
        order_type: settings.orderType,
        timestamp: "{{timenow}}"
    };
    document.getElementById('openWebhook').textContent = JSON.stringify(openWebhook, null, 2);
    
    const protectionSL = document.getElementById('protectionSL')?.checked || false;
    const protectionOrderType = document.querySelector('#protectionOrderType .mini-toggle-btn.active')?.dataset.type || 'market';
    
    takeProfits.forEach((tp, index) => {
        const tpWebhook = {
            token: userToken,
            action: "take_profit",
            symbol: settings.symbol,
            close_percent: `${tp.closePercent}%`,
            order_type: tp.orderType,
            trigger: `tp_${index + 1}`,
            timestamp: "{{timenow}}"
        };
        
        if (index === 0 && protectionSL) {
            tpWebhook.set_protection_sl = true;
            tpWebhook.protection_sl_price = "entry_price";
            tpWebhook.protection_sl_order_type = protectionOrderType;
        }
        
        const el = document.getElementById(`tpWebhook_${tp.id}`);
        if (el) el.textContent = JSON.stringify(tpWebhook, null, 2);
    });
    
    stopLosses.forEach((sl, index) => {
        const slWebhook = {
            token: userToken,
            action: "stop_loss",
            symbol: settings.symbol,
            close_percent: `${sl.closePercent}%`,
            order_type: sl.orderType,
            trigger: `sl${stopLosses.length > 1 ? '_' + (index + 1) : ''}`,
            timestamp: "{{timenow}}"
        };
        const el = document.getElementById(`slWebhook_${sl.id}`);
        if (el) el.textContent = JSON.stringify(slWebhook, null, 2);
    });
    
    updateSummary(settings);
}

function updateSummary(settings) {
    const container = document.getElementById('summaryContainer');
    let html = `<div class="alert-summary-item"><span class="alert-tag open">开仓</span><span class="alert-desc">做${settings.direction === 'long' ? '多' : '空'} ${settings.leverage}x ${settings.positionSize}%</span></div>`;
    
    const showProtectionSL = document.getElementById('protectionSL')?.checked || false;
    takeProfits.forEach((tp, index) => {
        if (tp.enabled) {
            const protectionTag = (index === 0 && showProtectionSL) ? ' 🛡️' : '';
            html += `<div class="alert-summary-item"><span class="alert-tag tp">止盈${index + 1}${protectionTag}</span><span class="alert-desc">平${tp.closePercent}%仓 ${tp.orderType === 'limit' ? '限价' : '市价'}</span></div>`;
        }
    });
    
    stopLosses.forEach((sl, index) => {
        if (sl.enabled) {
            html += `<div class="alert-summary-item"><span class="alert-tag sl">止损${stopLosses.length > 1 ? index + 1 : ''}</span><span class="alert-desc">平${sl.closePercent}%仓 ${sl.orderType === 'limit' ? '限价' : '市价'}</span></div>`;
        }
    });
    
    container.innerHTML = html;
}

// ==================== 保存配置功能 ====================

function saveCurrentConfig() {
    const settings = getSettings();
    const configName = `${settings.symbol} ${settings.direction === 'long' ? '做多' : '做空'} ${settings.leverage}x`;
    
    const config = {
        id: configIdCounter++,
        name: configName,
        symbol: settings.symbol,
        direction: settings.direction,
        orderType: settings.orderType,
        leverage: settings.leverage,
        positionSize: settings.positionSize,
        takeProfits: JSON.parse(JSON.stringify(takeProfits)),
        stopLosses: JSON.parse(JSON.stringify(stopLosses)),
        protectionSL: document.getElementById('protectionSL')?.checked || false,
        protectionOrderType: document.querySelector('#protectionOrderType .mini-toggle-btn.active')?.dataset.type || 'market',
        createdAt: new Date().toISOString()
    };
    
    savedConfigs.unshift(config);
    localStorage.setItem('tvtrade_configs', JSON.stringify(savedConfigs));
    
    addActivity('config_saved', `保存配置: ${configName}`, settings.symbol);
    renderSavedConfigs();
    showToast('配置已保存', 'success');
}

function loadConfig(id) {
    const config = savedConfigs.find(c => c.id === id);
    if (!config) return;
    
    activeConfigId = id;
    
    document.querySelector('select').value = config.symbol;
    
    const dirBtns = document.querySelectorAll('.toggle-group')[0].querySelectorAll('.toggle-btn');
    dirBtns.forEach(btn => btn.classList.remove('active'));
    if (config.direction === 'long') dirBtns[0].classList.add('active');
    else dirBtns[1].classList.add('active');
    
    const orderBtns = document.querySelectorAll('.toggle-group')[1].querySelectorAll('.toggle-btn');
    orderBtns.forEach(btn => btn.classList.remove('active'));
    if (config.orderType === 'market') orderBtns[0].classList.add('active');
    else orderBtns[1].classList.add('active');
    
    const leverageSlider = document.querySelector('input[max="125"]');
    leverageSlider.value = config.leverage;
    leverageSlider.parentElement.querySelector('.slider-value').textContent = config.leverage + 'x';
    
    const positionSlider = document.querySelector('input[max="100"]');
    positionSlider.value = config.positionSize;
    positionSlider.parentElement.querySelector('.slider-value').textContent = config.positionSize + '%';
    
    takeProfits = JSON.parse(JSON.stringify(config.takeProfits));
    stopLosses = JSON.parse(JSON.stringify(config.stopLosses));
    tpIdCounter = Math.max(...takeProfits.map(t => t.id), 0) + 1;
    slIdCounter = Math.max(...stopLosses.map(s => s.id), 0) + 1;
    
    const protectionCheckbox = document.getElementById('protectionSL');
    if (protectionCheckbox) protectionCheckbox.checked = config.protectionSL || false;
    if (config.protectionOrderType) setProtectionOrderType(config.protectionOrderType);
    
    renderTakeProfits();
    renderStopLosses();
    renderSavedConfigs();
    updatePosition();
    
    addActivity('config_loaded', `加载配置: ${config.name}`, config.symbol);
    showToast(`已加载: ${config.name}`, 'success');
}

function deleteConfig(id, e) {
    e.stopPropagation();
    const config = savedConfigs.find(c => c.id === id);
    savedConfigs = savedConfigs.filter(c => c.id !== id);
    localStorage.setItem('tvtrade_configs', JSON.stringify(savedConfigs));
    
    if (activeConfigId === id) activeConfigId = null;
    
    renderSavedConfigs();
    addActivity('config_deleted', `删除配置: ${config?.name || '未知'}`, config?.symbol || '');
    showToast('配置已删除', 'success');
}

function clearAllConfigs() {
    if (savedConfigs.length === 0) return;
    savedConfigs = [];
    localStorage.setItem('tvtrade_configs', JSON.stringify(savedConfigs));
    activeConfigId = null;
    renderSavedConfigs();
    showToast('已清空所有配置', 'success');
}

function renderSavedConfigs() {
    const container = document.getElementById('configList');
    
    if (savedConfigs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📁</div><div>暂无保存的配置</div></div>`;
        return;
    }
    
    container.innerHTML = savedConfigs.map(config => `
        <div class="config-item ${activeConfigId === config.id ? 'active' : ''}" onclick="loadConfig(${config.id})">
            <div>
                <span class="config-name">${config.name}</span>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">
                    ${config.takeProfits.length}个止盈 · ${config.stopLosses.length}个止损
                </div>
            </div>
            <div class="config-item-actions">
                <span class="config-type ${config.direction === 'long' ? 'open' : 'sl'}">${config.direction === 'long' ? '做多' : '做空'}</span>
                <button class="config-delete-btn" onclick="deleteConfig(${config.id}, event)">×</button>
            </div>
        </div>
    `).join('');
}

// ==================== 活动记录功能 ====================

function addActivity(type, title, symbol, amount = null) {
    const activity = { id: Date.now(), type, title, symbol, amount, time: new Date().toISOString() };
    activities.unshift(activity);
    if (activities.length > 20) activities = activities.slice(0, 20);
    localStorage.setItem('tvtrade_activities', JSON.stringify(activities));
    renderActivities();
}

function clearActivities() {
    activities = [];
    localStorage.setItem('tvtrade_activities', JSON.stringify(activities));
    renderActivities();
    showToast('已清空活动记录', 'success');
}

function renderActivities() {
    const container = document.getElementById('activityList');
    
    if (activities.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📜</div><div>暂无活动记录</div></div>`;
        return;
    }
    
    container.innerHTML = activities.slice(0, 5).map(activity => {
        const timeAgo = getTimeAgo(activity.time);
        const iconClass = activity.type.includes('saved') || activity.type.includes('loaded') ? 'success' : activity.type.includes('deleted') ? 'pending' : 'success';
        const icon = activity.type.includes('saved') ? '✓' : activity.type.includes('loaded') ? '↓' : activity.type.includes('deleted') ? '×' : '✓';
        
        return `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-icon ${iconClass}">${icon}</div>
                    <div class="history-details">
                        <h4>${activity.title}</h4>
                        <span>${activity.symbol} · ${timeAgo}</span>
                    </div>
                </div>
                ${activity.amount ? `<span class="history-amount ${activity.amount > 0 ? 'profit' : ''}">${activity.amount > 0 ? '+' : ''}$${Math.abs(activity.amount).toFixed(2)}</span>` : ''}
            </div>
        `;
    }).join('');
}

function getTimeAgo(isoTime) {
    const now = new Date();
    const time = new Date(isoTime);
    const diff = Math.floor((now - time) / 1000);
    
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

// ==================== 持仓显示功能 ====================

function updatePosition() {
    const settings = getSettings();
    const container = document.getElementById('positionBody');
    const card = document.getElementById('positionCard');
    
    currentPosition.symbol = settings.symbol;
    currentPosition.direction = settings.direction;
    currentPosition.leverage = parseInt(settings.leverage);
    
    const prices = {
        'BTCUSDT': { entry: 42150.50, current: 43285.20 },
        'ETHUSDT': { entry: 2250.30, current: 2312.45 },
        'BNBUSDT': { entry: 310.20, current: 318.60 },
        'SOLUSDT': { entry: 98.50, current: 102.30 },
        'XRPUSDT': { entry: 0.52, current: 0.54 }
    };
    
    const priceData = prices[settings.symbol] || prices['BTCUSDT'];
    currentPosition.entryPrice = priceData.entry;
    currentPosition.currentPrice = priceData.current;
    
    const priceChange = settings.direction === 'long' 
        ? (currentPosition.currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice
        : (currentPosition.entryPrice - currentPosition.currentPrice) / currentPosition.entryPrice;
    
    const pnlPercent = priceChange * currentPosition.leverage * 100;
    const pnlAmount = currentPosition.margin * priceChange * currentPosition.leverage;
    const isProfit = pnlAmount >= 0;
    
    card.className = `card position-card ${isProfit ? '' : 'loss'}`;
    
    container.innerHTML = `
        <div class="position-header">
            <span class="position-symbol">${currentPosition.symbol}</span>
            <span class="position-badge ${settings.direction}">${settings.direction.toUpperCase()} ${settings.leverage}x</span>
        </div>
        <div class="position-stats">
            <div class="stat-item"><div class="stat-label">开仓价格</div><div class="stat-value">$${currentPosition.entryPrice.toLocaleString()}</div></div>
            <div class="stat-item"><div class="stat-label">当前价格</div><div class="stat-value ${isProfit ? 'profit' : 'loss'}">$${currentPosition.currentPrice.toLocaleString()}</div></div>
            <div class="stat-item"><div class="stat-label">持仓数量</div><div class="stat-value">${currentPosition.quantity} ${settings.symbol.replace('USDT', '')}</div></div>
            <div class="stat-item"><div class="stat-label">保证金</div><div class="stat-value">$${currentPosition.margin.toFixed(2)}</div></div>
        </div>
        <div class="pnl-display">
            <div class="pnl-label">未实现盈亏</div>
            <div class="pnl-value ${isProfit ? 'profit' : 'loss'}">${isProfit ? '+' : ''}$${pnlAmount.toFixed(2)}</div>
            <div class="pnl-percent ${isProfit ? 'profit' : 'loss'}">${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1rem;">
            <button class="mini-action-btn" onclick="simulateTakeProfit()">模拟止盈</button>
            <button class="mini-action-btn danger" onclick="simulateStopLoss()">模拟止损</button>
        </div>
    `;
}

function simulateTakeProfit() {
    const settings = getSettings();
    const tp = takeProfits.find(t => t.enabled);
    if (!tp) { showToast('没有启用的止盈配置', 'error'); return; }
    
    const amount = currentPosition.margin * 0.05 * currentPosition.leverage * (parseFloat(tp.closePercent) / 100);
    addActivity('tp_triggered', `止盈触发 平${tp.closePercent}%仓`, settings.symbol, amount);
    showToast(`止盈触发! 平${tp.closePercent}%仓 +$${amount.toFixed(2)}`, 'success');
}

function simulateStopLoss() {
    const settings = getSettings();
    const sl = stopLosses.find(s => s.enabled);
    if (!sl) { showToast('没有启用的止损配置', 'error'); return; }
    
    const amount = -currentPosition.margin * 0.03 * currentPosition.leverage * (parseFloat(sl.closePercent) / 100);
    addActivity('sl_triggered', `止损触发 平${sl.closePercent}%仓`, settings.symbol, amount);
    showToast(`止损触发! 平${sl.closePercent}%仓 -$${Math.abs(amount).toFixed(2)}`, 'error');
}

// ==================== 工具函数 ====================

function copyWebhookUrl() {
    const url = document.getElementById('webhookUrl').value;
    copyToClipboard(url, document.querySelector('#webhookUrl').parentElement.querySelector('.copy-btn'));
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : '!'}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.remove(); }, 3000);
}

// 绑定保存按钮
document.getElementById('saveConfigBtn').addEventListener('click', saveCurrentConfig);

// ==================== 初始化 ====================

// 页面加载时验证会话
validateSession().then(() => {
    if (currentUser && authToken) {
        loadUserWebhook();
        loadExchangeConfig();
    }
});

renderTakeProfits();
renderStopLosses();
renderSavedConfigs();
renderActivities();
updatePosition();
updateUIState();

// 监听设置变化更新持仓
document.querySelectorAll('.toggle-group').forEach(group => {
    group.addEventListener('click', () => setTimeout(updatePosition, 50));
});
document.querySelectorAll('.slider').forEach(slider => {
    slider.addEventListener('input', () => setTimeout(updatePosition, 50));
});
document.querySelector('select').addEventListener('change', () => setTimeout(updatePosition, 50));
